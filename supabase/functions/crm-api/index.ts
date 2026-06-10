import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

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

    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(p => p);

    const functionBaseIndex = pathParts.indexOf('crm-api');
    const relevantParts = pathParts.slice(functionBaseIndex + 1);

    const resource = relevantParts[0] || '';
    const id = relevantParts[1];

    console.log('Request:', req.method, url.pathname, 'Resource:', resource, 'ID:', id);

    if (resource === 'clientes') {
      if (req.method === 'GET') {
        const { data, error } = await supabase
          .from('clientes')
          .select(`
            *,
            lead:leads!lead_id(
              url_acesso,
              campanha,
              click_id,
              gclid,
              ip
            )
          `)
          .order('created_at', { ascending: false });

        if (error) throw error;

        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (req.method === 'POST') {
        const body = await req.json();
        const { data, error } = await supabase
          .from('clientes')
          .insert([body])
          .select()
          .single();

        if (error) throw error;

        return new Response(JSON.stringify(data), {
          status: 201,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (req.method === 'PUT' && id) {
        const body = await req.json();
        const { data, error } = await supabase
          .from('clientes')
          .update(body)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;

        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (req.method === 'DELETE' && id) {
        const { error } = await supabase
          .from('clientes')
          .delete()
          .eq('id', id);

        if (error) throw error;

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (resource === 'ligacoes') {
      const clienteId = url.searchParams.get('cliente_id');

      if (req.method === 'GET' && clienteId) {
        const { data, error } = await supabase
          .from('ligacoes')
          .select('*')
          .eq('cliente_id', clienteId)
          .order('data', { ascending: false });

        if (error) throw error;

        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (req.method === 'POST') {
        const body = await req.json();
        const { data, error } = await supabase
          .from('ligacoes')
          .insert([body])
          .select()
          .single();

        if (error) throw error;

        return new Response(JSON.stringify(data), {
          status: 201,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (req.method === 'PUT' && id) {
        const body = await req.json();
        const { data, error } = await supabase
          .from('ligacoes')
          .update(body)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;

        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (req.method === 'DELETE' && id) {
        const { error } = await supabase
          .from('ligacoes')
          .delete()
          .eq('id', id);

        if (error) throw error;

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (resource === 'agendamentos') {
      if (req.method === 'GET') {
        const clienteId = url.searchParams.get('cliente_id');
        let query = supabase.from('agendamentos').select('*');

        if (clienteId) {
          query = query.eq('cliente_id', clienteId);
        }

        const { data, error } = await query.order('data', { ascending: true });

        if (error) throw error;

        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (req.method === 'POST') {
        const body = await req.json();
        const { data, error } = await supabase
          .from('agendamentos')
          .insert([body])
          .select()
          .single();

        if (error) throw error;

        if (data && body.cliente_id) {
          const { data: cliente } = await supabase
            .from('clientes')
            .select('status')
            .eq('id', body.cliente_id)
            .single();

          if (cliente && cliente.status !== 'acompanhamento') {
            await supabase
              .from('clientes')
              .update({ status: 'acompanhamento' })
              .eq('id', body.cliente_id);
          }
        }

        return new Response(JSON.stringify(data), {
          status: 201,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (req.method === 'PUT' && id) {
        const body = await req.json();
        const { data, error } = await supabase
          .from('agendamentos')
          .update(body)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;

        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (req.method === 'DELETE' && id) {
        const { error } = await supabase
          .from('agendamentos')
          .delete()
          .eq('id', id);

        if (error) throw error;

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ error: "Not found", resource, method: req.method }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("CRM API error:", error);

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