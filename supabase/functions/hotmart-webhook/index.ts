import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function normalizePhone(phone: string): string {
  if (!phone) return "";

  const digitsOnly = phone.replace(/\D/g, '');

  if (digitsOnly.startsWith('55')) {
    return `+${digitsOnly}`;
  }

  return `+55${digitsOnly}`;
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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload = await req.json();

    if (payload.event !== "PURCHASE_APPROVED") {
      return new Response(
        JSON.stringify({ message: "Event not processed", event: payload.event }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const buyer = payload.data?.buyer || {};
    const purchase = payload.data?.purchase || {};
    const product = payload.data?.product || {};
    const subscription = payload.data?.subscription || {};

    const nome = buyer.name || "";
    const email = buyer.email || "";
    const telefone = normalizePhone(buyer.checkout_phone || "");
    const documento = buyer.document || null;
    const pais = buyer.address?.country || null;
    const pais_iso = buyer.address?.country_iso || null;
    const data_compra = purchase.approved_date
      ? new Date(purchase.approved_date).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0];
    const valor = purchase.price?.value || 0;
    const moeda = purchase.price?.currency_value || "BRL";
    const hotmart_transaction_id = purchase.transaction || null;
    const subscriber_code = subscription.subscriber?.code || null;
    const produto_nome = product.name || "";
    const produto_id = product.id || 0;

    let clienteId: string | null = null;

    // Build OR conditions for finding existing cliente
    const orConditions: string[] = [];
    if (documento) orConditions.push(`documento.eq.${documento}`);
    if (email) orConditions.push(`email.eq.${email}`);
    if (telefone) orConditions.push(`telefone.eq.${telefone}`);

    const { data: existingCliente } = await supabase
      .from("clientes")
      .select("id, valor_produto, assessor, valor_deposito, performance")
      .or(orConditions.join(','))
      .maybeSingle();

    if (existingCliente) {
      clienteId = existingCliente.id;

      await supabase
        .from("clientes")
        .update({
          nome,
          email,
          telefone,
          documento,
          pais,
          pais_iso,
          moeda,
          valor_pago_moeda_original: valor,
          subscriber_code,
          updated_at: new Date().toISOString(),
        })
        .eq("id", clienteId);
    } else {
      const { data: newCliente } = await supabase
        .from("clientes")
        .insert([
          {
            nome,
            email,
            telefone,
            documento,
            data_compra,
            valor_produto: valor,
            status: "comprou",
            pais,
            pais_iso,
            moeda,
            valor_pago_moeda_original: valor,
            subscriber_code,
            hotmart_transaction_id,
          },
        ])
        .select("id")
        .single();

      clienteId = newCliente?.id || null;
    }

    if (!clienteId) {
      throw new Error("Failed to create or find cliente");
    }

    const { data: existingCompra } = await supabase
      .from("compras")
      .select("id")
      .eq("hotmart_transaction_id", hotmart_transaction_id)
      .maybeSingle();

    if (!existingCompra && hotmart_transaction_id) {
      await supabase.from("compras").insert([
        {
          cliente_id: clienteId,
          produto_nome,
          produto_id,
          valor,
          moeda,
          hotmart_transaction_id,
          data_compra,
        },
      ]);

      const { data: allCompras } = await supabase
        .from("compras")
        .select("valor")
        .eq("cliente_id", clienteId);

      const valorTotal = allCompras?.reduce(
        (sum, compra) => sum + (compra.valor || 0),
        0
      ) || 0;

      await supabase
        .from("clientes")
        .update({ valor_produto: valorTotal })
        .eq("id", clienteId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: existingCliente ? "Cliente atualizado" : "Cliente criado",
        cliente_id: clienteId,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Hotmart webhook error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});