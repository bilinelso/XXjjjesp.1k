/*
  # Adicionar permissão de acesso a formulários

  1. Alterações
    - Adiciona coluna `can_access_formularios` na tabela `user_profiles`
    - Define valor padrão como `false`
    - Permite que usuários master acessem formulários por padrão

  2. Segurança
    - Nenhuma alteração nas políticas RLS necessária
    - A coluna existente já está protegida pelas políticas RLS atuais
*/

-- Adicionar coluna can_access_formularios
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'can_access_formularios'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN can_access_formularios BOOLEAN DEFAULT false;
  END IF;
END $$;