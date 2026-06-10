/*
  # Atualizar permissão de formulários para usuários master
  
  1. Alterações
    - Atualiza todos os usuários master existentes para ter `can_access_formularios = true`
    - Garante consistência no banco de dados
  
  2. Motivo
    - A coluna `can_access_formularios` foi adicionada posteriormente
    - Usuários master criados antes da migração não têm essa permissão definida explicitamente
    - Embora a lógica do front-end já permita acesso (is_master = true), 
      é melhor manter a consistência no banco de dados
*/

-- Atualizar usuários master existentes para ter acesso a formulários
UPDATE user_profiles
SET can_access_formularios = true
WHERE is_master = true AND can_access_formularios = false;