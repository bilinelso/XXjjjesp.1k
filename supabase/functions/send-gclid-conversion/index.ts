import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function sha256(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

function normalizeEmail(email: string): string {
  let normalized = email.toLowerCase().trim();

  const [localPart, domain] = normalized.split('@');

  if (domain === 'gmail.com') {
    const withoutDots = localPart.replace(/\./g, '');
    const beforePlus = withoutDots.split('+')[0];
    normalized = `${beforePlus}@${domain}`;
  }

  return normalized;
}

function normalizePhone(phone: string): string {
  const digitsOnly = phone.replace(/\D/g, '');

  if (digitsOnly.startsWith('55')) {
    return `+${digitsOnly}`;
  }

  return `+55${digitsOnly}`;
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function convertToGMTMinus3(timestamptz: string): string {
  const date = new Date(timestamptz);

  const gmtMinus3Date = new Date(date.getTime() - (3 * 60 * 60 * 1000));

  const year = gmtMinus3Date.getUTCFullYear();
  const month = String(gmtMinus3Date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(gmtMinus3Date.getUTCDate()).padStart(2, '0');
  const hours = String(gmtMinus3Date.getUTCHours()).padStart(2, '0');
  const minutes = String(gmtMinus3Date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(gmtMinus3Date.getUTCSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}-03:00`;
}

async function appendToGoogleSheet(rowData: string[][]): Promise<void> {
  const spreadsheetId = '1b8S_msF7BjPzWfPA4LxjY5RFV7RwyhcCpA6cuPd1q98';
  const range = 'Sheet1!A:K';

  const serviceAccountEmail = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL');
  const privateKey = Deno.env.get('GOOGLE_PRIVATE_KEY');

  if (!serviceAccountEmail || !privateKey) {
    throw new Error('Google credentials not configured');
  }

  const now = Math.floor(Date.now() / 1000);
  const jwtHeader = {
    alg: 'RS256',
    typ: 'JWT'
  };

  const jwtPayload = {
    iss: serviceAccountEmail,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  const encoder = new TextEncoder();
  const headerB64 = btoa(JSON.stringify(jwtHeader)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const payloadB64 = btoa(JSON.stringify(jwtPayload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const signatureInput = `${headerB64}.${payloadB64}`;

  const pemKey = privateKey.replace(/\\n/g, '\n');
  const pemContents = pemKey
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');

  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    encoder.encode(signatureInput)
  );

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const jwt = `${signatureInput}.${signatureB64}`;

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`Failed to get access token: ${errorText}`);
  }

  const { access_token } = await tokenResponse.json();

  const appendResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=RAW`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: rowData
      })
    }
  );

  if (!appendResponse.ok) {
    const errorText = await appendResponse.text();
    throw new Error(`Failed to append to sheet: ${errorText}`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        {
          status: 405,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { clienteId } = await req.json();

    if (!clienteId) {
      return new Response(
        JSON.stringify({ error: "clienteId is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: cliente, error: clienteError } = await supabase
      .from('clientes')
      .select(`
        id,
        nome,
        email,
        telefone,
        gclid_enviado,
        lead_id,
        leads!clientes_lead_id_fkey (
          gclid
        )
      `)
      .eq('id', clienteId)
      .single();

    if (clienteError || !cliente) {
      return new Response(
        JSON.stringify({ error: "Cliente não encontrado" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (cliente.gclid_enviado) {
      return new Response(
        JSON.stringify({ error: "GCLID já foi enviado para este cliente" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!cliente.leads || !cliente.leads.gclid) {
      return new Response(
        JSON.stringify({ error: "Cliente não possui GCLID associado" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: compra, error: compraError } = await supabase
      .from('compras')
      .select('hotmart_transaction_id, created_at, valor')
      .eq('cliente_id', clienteId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (compraError || !compra) {
      return new Response(
        JSON.stringify({ error: "Compra não encontrada para este cliente" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const gclid = cliente.leads.gclid;
    let googleClickId = '';
    let googleWbraid = '';

    if (gclid.endsWith('_gclid')) {
      googleClickId = gclid.replace('_gclid', '');
    } else if (gclid.endsWith('_wbraid')) {
      googleWbraid = gclid.replace('_wbraid', '');
    } else {
      googleClickId = gclid;
    }

    const nameParts = cliente.nome.trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    const normalizedEmail = normalizeEmail(cliente.email);
    const normalizedPhone = normalizePhone(cliente.telefone);
    const normalizedFirstName = normalizeName(firstName);
    const normalizedLastName = normalizeName(lastName);

    const hashedEmail = await sha256(normalizedEmail);
    const hashedPhone = await sha256(normalizedPhone);
    const hashedFirstName = await sha256(normalizedFirstName);
    const hashedLastName = await sha256(normalizedLastName);

    const conversionTime = convertToGMTMinus3(compra.created_at);
    const value = Number(compra.valor).toFixed(2);

    const rowData = [[
      googleClickId,
      googleWbraid,
      'Conversion by GCLID',
      conversionTime,
      value,
      'BRL',
      hashedPhone,
      hashedFirstName,
      hashedLastName,
      hashedEmail,
      compra.hotmart_transaction_id
    ]];

    await appendToGoogleSheet(rowData);

    await supabase
      .from('clientes')
      .update({
        gclid_enviado: true,
        gclid_enviado_em: new Date().toISOString()
      })
      .eq('id', clienteId);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Conversão GCLID enviada com sucesso"
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("Send GCLID conversion error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});