/*
  # Criar tabela de colunas editáveis do Kanban

  ## Descrição
  Esta migração cria a estrutura para permitir nomes editáveis das colunas do Kanban.
  Os status keys (valores no banco) permanecem fixos, mas os nomes de exibição são editáveis.

  ## Novas Tabelas

  ### kanban_columns
  Armazena os nomes editáveis das colunas do Kanban
  
  **Colunas:**
  - `id` (uuid, primary key): Identificador único
  - `status_key` (text, unique, required): Chave do status no banco (comprou, conta-criada, etc)
  - `display_name` (text, required): Nome editável exibido na UI
  - `ordem` (integer, required): Ordem de exibição da coluna
  - `created_at` (timestamptz): Data de criação
  - `updated_at` (timestamptz): Data de atualização

  ## Segurança
  - RLS habilitado para acesso apenas por usuários autenticados
  - Políticas para SELECT, UPDATE (INSERT e DELETE não permitidos na UI)

  ## Dados Iniciais
  Insere os 6 status padrão com seus nomes atuais:
  1. comprou → Aguardando Conta
  2. conta-criada → Conta Criada
  3. depositou → Depositou
  4. acompanhamento → Primeiro Saque
  5. problema → Realizando Saque
  6. finalizado → Finalizado
*/

-- Criar tabela kanban_columns
CREATE TABLE IF NOT EXISTS kanban_columns (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  status_key text UNIQUE NOT NULL,
  display_name text NOT NULL,
  ordem integer NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Índice para ordem
CREATE INDEX IF NOT EXISTS idx_kanban_columns_ordem ON kanban_columns(ordem);

-- Habilitar RLS
ALTER TABLE kanban_columns ENABLE ROW LEVEL SECURITY;

-- Política para SELECT (todos usuários autenticados podem ver)
CREATE POLICY "Allow authenticated users to read kanban columns"
  ON kanban_columns
  FOR SELECT
  TO authenticated
  USING (true);

-- Política para UPDATE (todos usuários autenticados podem editar)
CREATE POLICY "Allow authenticated users to update kanban columns"
  ON kanban_columns
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Função para atualizar updated_at se não existir
CREATE OR REPLACE FUNCTION update_kanban_columns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para atualizar updated_at
DROP TRIGGER IF EXISTS trigger_update_kanban_columns_updated_at ON kanban_columns;
CREATE TRIGGER trigger_update_kanban_columns_updated_at
  BEFORE UPDATE ON kanban_columns
  FOR EACH ROW
  EXECUTE FUNCTION update_kanban_columns_updated_at();

-- Inserir os 6 status padrão
INSERT INTO kanban_columns (status_key, display_name, ordem) VALUES
  ('comprou', 'Aguardando Conta', 1),
  ('conta-criada', 'Conta Criada', 2),
  ('depositou', 'Depositou', 3),
  ('acompanhamento', 'Primeiro Saque', 4),
  ('problema', 'Realizando Saque', 5),
  ('finalizado', 'Finalizado', 6)
ON CONFLICT (status_key) DO NOTHING;