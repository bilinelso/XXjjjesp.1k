/*
  # Melhorar vinculação de leads com funções de normalização
  
  1. Extensões
    - Habilita `unaccent` para remover acentos de nomes
  
  2. Novas Funções
    - `normalize_email()` - Normaliza emails (lowercase, trim, remove espaços)
    - `normalize_phone()` - Normaliza telefones (remove todos caracteres não-numéricos)
    - `normalize_name()` - Normaliza nomes (lowercase, trim, remove acentos, remove espaços extras)
  
  3. Colunas Calculadas
    - Adiciona colunas normalizadas em ambas tabelas para melhorar performance
    - `email_normalized`, `telefone_normalized`, `nome_normalized`
  
  4. Funções Atualizadas
    - Atualiza `sync_clientes_leads` para usar funções de normalização
    - Atualiza `link_cliente_to_lead` para usar funções de normalização
    - Atualiza `update_clientes_on_new_lead` para usar funções de normalização
  
  5. Índices
    - Cria índices nas colunas normalizadas para performance
  
  Notas importantes:
  - Nome é apenas para referência, não é usado no matching
  - Email tem prioridade sobre telefone no matching
  - A normalização é case-insensitive e remove caracteres especiais
*/

-- Habilitar extensão unaccent para remover acentos
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Drop funções existentes se necessário
DROP FUNCTION IF EXISTS normalize_email(TEXT);
DROP FUNCTION IF EXISTS normalize_phone(TEXT);
DROP FUNCTION IF EXISTS normalize_name(TEXT);

-- Função para normalizar email
CREATE FUNCTION normalize_email(email TEXT)
RETURNS TEXT AS $$
BEGIN
  IF email IS NULL OR TRIM(email) = '' THEN
    RETURN NULL;
  END IF;
  
  RETURN LOWER(TRIM(REGEXP_REPLACE(email, '\s+', '', 'g')));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Função para normalizar telefone (remove todos caracteres não-numéricos)
CREATE FUNCTION normalize_phone(phone TEXT)
RETURNS TEXT AS $$
BEGIN
  IF phone IS NULL OR TRIM(phone) = '' THEN
    RETURN NULL;
  END IF;
  
  RETURN REGEXP_REPLACE(phone, '[^0-9]', '', 'g');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Função para normalizar nome (remove acentos, lowercase, trim)
CREATE FUNCTION normalize_name(name TEXT)
RETURNS TEXT AS $$
BEGIN
  IF name IS NULL OR TRIM(name) = '' THEN
    RETURN NULL;
  END IF;
  
  RETURN LOWER(TRIM(REGEXP_REPLACE(unaccent(name), '\s+', ' ', 'g')));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Adicionar colunas normalizadas na tabela clientes (se não existirem)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clientes' AND column_name = 'email_normalized'
  ) THEN
    ALTER TABLE clientes ADD COLUMN email_normalized TEXT GENERATED ALWAYS AS (normalize_email(email)) STORED;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clientes' AND column_name = 'telefone_normalized'
  ) THEN
    ALTER TABLE clientes ADD COLUMN telefone_normalized TEXT GENERATED ALWAYS AS (normalize_phone(telefone)) STORED;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clientes' AND column_name = 'nome_normalized'
  ) THEN
    ALTER TABLE clientes ADD COLUMN nome_normalized TEXT GENERATED ALWAYS AS (normalize_name(nome)) STORED;
  END IF;
END $$;

-- Adicionar colunas normalizadas na tabela leads (se não existirem)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'email_normalized'
  ) THEN
    ALTER TABLE leads ADD COLUMN email_normalized TEXT GENERATED ALWAYS AS (normalize_email(email)) STORED;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'telefone_normalized'
  ) THEN
    ALTER TABLE leads ADD COLUMN telefone_normalized TEXT GENERATED ALWAYS AS (normalize_phone(telefone)) STORED;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'nome_normalized'
  ) THEN
    ALTER TABLE leads ADD COLUMN nome_normalized TEXT GENERATED ALWAYS AS (normalize_name(nome)) STORED;
  END IF;
END $$;

-- Criar índices nas colunas normalizadas para performance
CREATE INDEX IF NOT EXISTS idx_clientes_email_normalized ON clientes(email_normalized) WHERE email_normalized IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clientes_telefone_normalized ON clientes(telefone_normalized) WHERE telefone_normalized IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_email_normalized ON leads(email_normalized) WHERE email_normalized IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_telefone_normalized ON leads(telefone_normalized) WHERE telefone_normalized IS NOT NULL;

-- Atualizar função sync_clientes_leads para usar normalização
CREATE OR REPLACE FUNCTION sync_clientes_leads()
RETURNS TABLE(total_vinculados bigint, vinculados_por_email bigint, vinculados_por_telefone bigint) AS $$
DECLARE
  v_email_count bigint;
  v_phone_count bigint;
  v_total bigint;
BEGIN
  -- Vincular por email (prioridade 1) usando campos normalizados
  WITH updated_by_email AS (
    UPDATE clientes c
    SET lead_id = l.id
    FROM leads l
    WHERE c.lead_id IS NULL
      AND c.email_normalized IS NOT NULL
      AND l.email_normalized IS NOT NULL
      AND c.email_normalized = l.email_normalized
    RETURNING c.id
  )
  SELECT COUNT(*) INTO v_email_count FROM updated_by_email;

  -- Vincular por telefone (prioridade 2) usando campos normalizados
  WITH updated_by_phone AS (
    UPDATE clientes c
    SET lead_id = l.id
    FROM leads l
    WHERE c.lead_id IS NULL
      AND c.telefone_normalized IS NOT NULL
      AND l.telefone_normalized IS NOT NULL
      AND c.telefone_normalized = l.telefone_normalized
    RETURNING c.id
  )
  SELECT COUNT(*) INTO v_phone_count FROM updated_by_phone;

  v_total := v_email_count + v_phone_count;

  RETURN QUERY SELECT v_total, v_email_count, v_phone_count;
END;
$$ LANGUAGE plpgsql;

-- Atualizar trigger function link_cliente_to_lead para usar normalização
CREATE OR REPLACE FUNCTION link_cliente_to_lead()
RETURNS TRIGGER AS $$
BEGIN
  -- Try to link by email first (most recent lead) usando campos normalizados
  IF NEW.email_normalized IS NOT NULL THEN
    SELECT id INTO NEW.lead_id
    FROM leads
    WHERE email_normalized = NEW.email_normalized
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  -- If no match by email, try by phone (most recent lead) usando campos normalizados
  IF NEW.lead_id IS NULL AND NEW.telefone_normalized IS NOT NULL THEN
    SELECT id INTO NEW.lead_id
    FROM leads
    WHERE telefone_normalized = NEW.telefone_normalized
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Atualizar trigger function update_clientes_on_new_lead para usar normalização
CREATE OR REPLACE FUNCTION update_clientes_on_new_lead()
RETURNS TRIGGER AS $$
BEGIN
  -- Update clientes with matching email to point to this new lead (most recent)
  IF NEW.email_normalized IS NOT NULL THEN
    UPDATE clientes
    SET lead_id = NEW.id
    WHERE email_normalized = NEW.email_normalized
      AND (lead_id IS NULL OR lead_id IN (
        SELECT id FROM leads 
        WHERE email_normalized = NEW.email_normalized 
          AND created_at < NEW.created_at
      ));
  END IF;

  -- Update clientes with matching phone to point to this new lead (most recent)
  IF NEW.telefone_normalized IS NOT NULL THEN
    UPDATE clientes
    SET lead_id = NEW.id
    WHERE telefone_normalized = NEW.telefone_normalized
      AND (lead_id IS NULL OR lead_id IN (
        SELECT id FROM leads 
        WHERE telefone_normalized = NEW.telefone_normalized 
          AND created_at < NEW.created_at
      ));
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;