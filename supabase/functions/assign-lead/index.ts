import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { cliente_id } = await req.json();
    if (!cliente_id) throw new Error("cliente_id is required");

    // 1. Verificar configuração ativa
    const { data: config } = await supabase
      .from("lead_distribution_config")
      .select("mode, is_active")
      .eq("is_active", true)
      .maybeSingle();

    if (!config) {
      return new Response(
        JSON.stringify({ error: "Distribuição automática não está ativa" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Buscar assessores ativos com user_id
    const { data: assessores } = await supabase
      .from("assessores")
      .select("id, nome, user_id, last_received_at")
      .eq("ativo", true)
      .not("user_id", "is", null);

    if (!assessores || assessores.length === 0) {
      return new Response(
        JSON.stringify({ error: "Nenhum assessor ativo disponível" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let assignedAssessor: { id: string; nome: string; user_id: string } | null = null;

    if (config.mode === "round_robin") {
      // Ordena por last_received_at ASC (quem há mais tempo não recebe fica primeiro)
      const sorted = [...assessores].sort((a, b) => {
        if (!a.last_received_at) return -1;
        if (!b.last_received_at) return 1;
        return new Date(a.last_received_at).getTime() - new Date(b.last_received_at).getTime();
      });
      assignedAssessor = sorted[0];

    } else if (config.mode === "by_load") {
      // Conta clientes ativos por assessor
      let minLoad = Infinity;
      for (const assessor of assessores) {
        const { count } = await supabase
          .from("clientes")
          .select("*", { count: "exact", head: true })
          .eq("assessor", assessor.nome)
          .not("status", "in", '("finalizado","inativo","problema")');

        const load = count ?? 0;
        if (load < minLoad) {
          minLoad = load;
          assignedAssessor = assessor;
        }
      }

    } else if (config.mode === "by_availability") {
      // Filtra assessores disponíveis
      const { data: available } = await supabase
        .from("assessor_availability")
        .select("assessor_id")
        .eq("is_available", true);

      const availableIds = new Set((available || []).map((a: any) => a.assessor_id));
      const availableAssessors = assessores.filter(a => availableIds.has(a.id));

      if (availableAssessors.length === 0) {
        return new Response(
          JSON.stringify({ error: "Nenhum assessor disponível no momento" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Round robin entre os disponíveis
      const sorted = [...availableAssessors].sort((a, b) => {
        if (!a.last_received_at) return -1;
        if (!b.last_received_at) return 1;
        return new Date(a.last_received_at).getTime() - new Date(b.last_received_at).getTime();
      });
      assignedAssessor = sorted[0];
    }

    if (!assignedAssessor) {
      return new Response(
        JSON.stringify({ error: "Não foi possível determinar assessor" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Atualizar last_received_at do assessor
    await supabase
      .from("assessores")
      .update({ last_received_at: new Date().toISOString() })
      .eq("id", assignedAssessor.id);

    // 4. Atribuir assessor ao cliente
    await supabase
      .from("clientes")
      .update({ assessor: assignedAssessor.nome })
      .eq("id", cliente_id);

    return new Response(
      JSON.stringify({
        success: true,
        assessor_id: assignedAssessor.id,
        assessor_nome: assignedAssessor.nome,
        user_id: assignedAssessor.user_id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("assign-lead error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
