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

    const { email, password, permissions = {} } = await req.json();

    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: 'E-mail e senha sao obrigatorios' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (authError) {
      return new Response(
        JSON.stringify({ error: authError.message }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const nomeBase = email.split('@')[0];
    const nomeFormatado = nomeBase.charAt(0).toUpperCase() + nomeBase.slice(1).toLowerCase();
    let assessorId: string | null = null;
    let createdAssessorId: string | null = null;
    let linkedExistingAssessorId: string | null = null;

    const cleanupCreatedUser = async (message: string, detail?: string) => {
      if (createdAssessorId) {
        await supabaseAdmin
          .from('assessores')
          .delete()
          .eq('id', createdAssessorId);
      }

      if (linkedExistingAssessorId) {
        await supabaseAdmin
          .from('assessores')
          .update({ user_id: null })
          .eq('id', linkedExistingAssessorId);
      }

      await supabaseAdmin
        .from('user_profiles')
        .delete()
        .eq('id', authData.user.id);

      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);

      return new Response(
        JSON.stringify({ error: message, detail }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    };

    const { data: existingAssessor, error: existingAssessorError } = await supabaseAdmin
      .from('assessores')
      .select('id')
      .eq('user_id', authData.user.id)
      .maybeSingle();

    if (existingAssessorError) {
      return await cleanupCreatedUser('Erro ao buscar assessor do usuario', existingAssessorError.message);
    }

    if (existingAssessor) {
      assessorId = existingAssessor.id;
    } else {
      const { data: existingByName, error: existingByNameError } = await supabaseAdmin
        .from('assessores')
        .select('id, user_id')
        .ilike('nome', nomeFormatado)
        .limit(1)
        .maybeSingle();

      if (existingByNameError) {
        return await cleanupCreatedUser('Erro ao buscar assessor por nome', existingByNameError.message);
      }

      if (existingByName && !existingByName.user_id) {
        const { data: linkedAssessor, error: linkAssessorError } = await supabaseAdmin
          .from('assessores')
          .update({ user_id: authData.user.id })
          .eq('id', existingByName.id)
          .select('id')
          .single();

        if (linkAssessorError) {
          return await cleanupCreatedUser('Erro ao vincular assessor existente ao usuario', linkAssessorError.message);
        }

        assessorId = linkedAssessor.id;
        linkedExistingAssessorId = linkedAssessor.id;
      } else {
        const assessorName = existingByName ? `${nomeFormatado} (${email})` : nomeFormatado;
        const { data: createdAssessor, error: createAssessorError } = await supabaseAdmin
          .from('assessores')
          .insert({ nome: assessorName, ativo: true, user_id: authData.user.id })
          .select('id')
          .single();

        if (createAssessorError) {
          return await cleanupCreatedUser('Erro ao criar assessor do usuario', createAssessorError.message);
        }

        assessorId = createdAssessor.id;
        createdAssessorId = createdAssessor.id;
      }
    }

    if (assessorId) {
      const { error: availabilityError } = await supabaseAdmin
        .from('assessor_availability')
        .upsert({ assessor_id: assessorId, is_available: true }, { onConflict: 'assessor_id' });

      if (availabilityError) {
        return await cleanupCreatedUser('Erro ao criar disponibilidade do assessor', availabilityError.message);
      }
    }

    const { error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .insert({
        id: authData.user.id,
        email,
        is_master: false,
        can_access_leads: permissions.can_access_leads || false,
        can_access_dashboard: permissions.can_access_dashboard || false,
        can_access_kanban: permissions.can_access_kanban || false,
        can_access_agendamentos: permissions.can_access_agendamentos || false,
        can_access_config: permissions.can_access_config || false,
        can_access_formularios: permissions.can_access_formularios || false,
        can_access_whatsapp: permissions.can_access_whatsapp || false,
        can_access_campanhas: permissions.can_access_campanhas || false,
        can_access_financeiro: permissions.can_access_financeiro || false,
        can_access_passwords: permissions.can_access_passwords || false,
        can_access_leads_captura: permissions.can_access_leads_captura || false,
        assessor_id: assessorId
      });

    if (profileError) {
      return await cleanupCreatedUser('Erro ao criar perfil do usuario', profileError.message);
    }

    return new Response(
      JSON.stringify({ success: true, user: authData.user, assessor_id: assessorId }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
