// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const { userId } = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'ID do usuário é obrigatório' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: userAssessores, error: assessorLookupError } = await supabaseAdmin
      .from('assessores')
      .select('id, nome')
      .eq('user_id', userId);

    if (assessorLookupError) {
      return new Response(
        JSON.stringify({ error: 'Erro ao buscar assessores do usuario', detail: assessorLookupError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    for (const assessor of userAssessores || []) {
      const { data: clientesVinculados } = await supabaseAdmin
        .from('clientes')
        .select('id, assessor')
        .ilike('assessor', `%${assessor.nome}%`);

      for (const cliente of clientesVinculados || []) {
        const assessoresAtualizados = (cliente.assessor || '')
          .split('/')
          .map((nome: string) => nome.trim())
          .filter(Boolean)
          .filter((nome: string) => nome.toLowerCase() !== assessor.nome.toLowerCase())
          .join('/');

        if (assessoresAtualizados !== cliente.assessor) {
          await supabaseAdmin
            .from('clientes')
            .update({ assessor: assessoresAtualizados || null })
            .eq('id', cliente.id);
        }
      }

      await supabaseAdmin
        .from('assessor_availability')
        .delete()
        .eq('assessor_id', assessor.id);

      await supabaseAdmin
        .from('user_profiles')
        .update({ assessor_id: null })
        .eq('assessor_id', assessor.id);

      await supabaseAdmin
        .from('cliente_assessores')
        .delete()
        .eq('assessor_id', assessor.id);

      const { error: deleteAssessorError } = await supabaseAdmin
        .from('assessores')
        .delete()
        .eq('id', assessor.id);

      if (deleteAssessorError) {
        return new Response(
          JSON.stringify({ error: 'Erro ao deletar assessor do usuario', detail: deleteAssessorError.message }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    // Deleta perfil explicitamente antes de remover de auth.users
    const { error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .delete()
      .eq('id', userId);

    if (profileError && profileError.code !== 'PGRST116') {
      return new Response(
        JSON.stringify({ error: 'Erro ao deletar perfil do usuário' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
