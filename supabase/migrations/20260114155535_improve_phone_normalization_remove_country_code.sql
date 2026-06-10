/*
  # Melhorar normalização de telefone para remover código de país
  
  1. Função Atualizada
    - `normalize_phone()` - Agora remove código de país brasileiro (+55) automaticamente
    - Permite matching de telefones com ou sem código de país
  
  2. Reconstruir Colunas
    - Drop e recria as colunas de telefone normalizado para recalcular
  
  3. Re-executar Sincronização
    - Isso permitirá que telefones como "21993935069" e "+5521993935069" façam match
  
  Notas:
  - Mantém apenas os últimos 10-11 dígitos do telefone (DDD + número)
  - Remove código de país 55 se presente
*/

-- Atualizar função normalize_phone para remover código de país
CREATE OR REPLACE FUNCTION normalize_phone(phone TEXT)
RETURNS TEXT AS $$
DECLARE
  cleaned TEXT;
BEGIN
  IF phone IS NULL OR TRIM(phone) = '' THEN
    RETURN NULL;
  END IF;
  
  -- Remove todos caracteres não-numéricos
  cleaned := REGEXP_REPLACE(phone, '[^0-9]', '', 'g');
  
  -- Se começa com 55 (código do Brasil) e tem mais de 11 dígitos, remove o 55
  IF LENGTH(cleaned) > 11 AND LEFT(cleaned, 2) = '55' THEN
    cleaned := SUBSTRING(cleaned FROM 3);
  END IF;
  
  -- Se ainda tem mais de 11 dígitos, pega apenas os últimos 11
  IF LENGTH(cleaned) > 11 THEN
    cleaned := RIGHT(cleaned, 11);
  END IF;
  
  RETURN cleaned;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Recriar coluna telefone_normalized na tabela clientes
ALTER TABLE clientes DROP COLUMN IF EXISTS telefone_normalized;
ALTER TABLE clientes ADD COLUMN telefone_normalized TEXT GENERATED ALWAYS AS (normalize_phone(telefone)) STORED;

-- Recriar coluna telefone_normalized na tabela leads  
ALTER TABLE leads DROP COLUMN IF EXISTS telefone_normalized;
ALTER TABLE leads ADD COLUMN telefone_normalized TEXT GENERATED ALWAYS AS (normalize_phone(telefone)) STORED;

-- Recriar índices
DROP INDEX IF EXISTS idx_clientes_telefone_normalized;
DROP INDEX IF EXISTS idx_leads_telefone_normalized;
CREATE INDEX idx_clientes_telefone_normalized ON clientes(telefone_normalized) WHERE telefone_normalized IS NOT NULL;
CREATE INDEX idx_leads_telefone_normalized ON leads(telefone_normalized) WHERE telefone_normalized IS NOT NULL;