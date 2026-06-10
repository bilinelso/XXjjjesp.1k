/*
  # Configurações do SendAPI
  
  1. Nova Tabela
    - `sendapi_config`
      - `id` (uuid, primary key)
      - `account_id` (text) - ID da conta do SendAPI para refresh de grupos
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
  
  2. Segurança
    - Enable RLS na tabela `sendapi_config`
    - Adicionar políticas para usuários master lerem e editarem configurações
*/

CREATE TABLE IF NOT EXISTS sendapi_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE sendapi_config ENABLE ROW LEVEL SECURITY;

-- Política para master ler configurações
CREATE POLICY "Master users can read sendapi config"
  ON sendapi_config
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_master = true
    )
  );

-- Política para master atualizar configurações
CREATE POLICY "Master users can update sendapi config"
  ON sendapi_config
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_master = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_master = true
    )
  );

-- Política para master inserir configurações
CREATE POLICY "Master users can insert sendapi config"
  ON sendapi_config
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_master = true
    )
  );

-- Inserir configuração padrão com o account_id fornecido
INSERT INTO sendapi_config (account_id)
VALUES ('jVMXJHJsT3hQjr7BXHEb')
ON CONFLICT DO NOTHING;