/*
  # Remover email da tabela leads
  
  1. Alteracoes
    - Remove a constraint NOT NULL do campo email (se existir)
    - Remove o campo email_normalized da tabela leads
    - Atualiza triggers e funcoes de matching para usar apenas telefone
  
  2. Motivacao
    - O formulario externo nao coleta mais email
    - O matching entre leads e clientes sera feito apenas por telefone
  
  3. Impacto
    - Leads existentes mantem o email que ja possuem
    - Novos leads podem ser inseridos sem email
    - Matching de leads com clientes sera feito por telefone
*/

-- Remover a coluna email_normalized (gerada automaticamente)
ALTER TABLE leads DROP COLUMN IF EXISTS email_normalized;

-- Tornar email opcional na tabela leads (ja e nullable, mas garantindo)
ALTER TABLE leads ALTER COLUMN email DROP NOT NULL;

-- Atualizar a funcao de matching para usar apenas telefone
CREATE OR REPLACE FUNCTION link_cliente_to_lead()
RETURNS TRIGGER AS $$
BEGIN
  -- Try to link by phone (most recent lead) usando campos normalizados
  IF NEW.telefone_normalized IS NOT NULL THEN
    SELECT id INTO NEW.lead_id
    FROM leads
    WHERE telefone_normalized = NEW.telefone_normalized
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Atualizar a funcao que sincroniza clientes com novos leads
CREATE OR REPLACE FUNCTION update_clientes_on_new_lead()
RETURNS TRIGGER AS $$
BEGIN
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

-- Atualizar funcao sync_clientes_leads para usar apenas telefone
CREATE OR REPLACE FUNCTION sync_clientes_leads()
RETURNS TABLE(total_vinculados bigint, vinculados_por_email bigint, vinculados_por_telefone bigint) AS $$
DECLARE
  v_phone_count bigint;
  v_total bigint;
BEGIN
  -- Vincular por telefone usando campos normalizados
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

  v_total := v_phone_count;

  -- Retorna 0 para email pois nao e mais usado
  RETURN QUERY SELECT v_total, 0::bigint, v_phone_count;
END;
$$ LANGUAGE plpgsql;