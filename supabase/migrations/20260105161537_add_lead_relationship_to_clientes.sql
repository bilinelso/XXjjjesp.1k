/*
  # Relacionar tabelas leads e clientes

  1. Mudanças na estrutura
    - Adiciona coluna `lead_id` na tabela `clientes`
    - Cria foreign key referenciando `leads(id)`
    - Adiciona índice para otimizar consultas

  2. Migração de dados existentes
    - Vincula registros existentes usando email como critério primário
    - Se email não bater, tenta vincular por telefone
    - Mantém registros não vinculados (lead_id = NULL)

  3. Segurança
    - Mantém políticas RLS existentes
    - Coluna aceita NULL para flexibilidade

  ## Notas importantes
  - O matching é feito por email OU telefone (prioriza email)
  - Clientes sem lead correspondente ficam com lead_id NULL
  - A relação permite rastrear origem do lead que gerou o cliente
*/

-- Add lead_id column to clientes table
ALTER TABLE clientes 
ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES leads(id) ON DELETE SET NULL;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_clientes_lead_id ON clientes(lead_id);

-- Link existing records by email (priority 1)
UPDATE clientes c
SET lead_id = l.id
FROM leads l
WHERE c.lead_id IS NULL
  AND c.email IS NOT NULL
  AND l.email IS NOT NULL
  AND LOWER(TRIM(c.email)) = LOWER(TRIM(l.email));

-- Link existing records by phone (priority 2, only if not already linked by email)
UPDATE clientes c
SET lead_id = l.id
FROM leads l
WHERE c.lead_id IS NULL
  AND c.telefone IS NOT NULL
  AND l.telefone IS NOT NULL
  AND LOWER(TRIM(REPLACE(REPLACE(REPLACE(c.telefone, ' ', ''), '-', ''), '(', ''))) = 
      LOWER(TRIM(REPLACE(REPLACE(REPLACE(l.telefone, ' ', ''), '-', ''), '(', '')));

-- Create a function to auto-link new clients to leads
CREATE OR REPLACE FUNCTION link_cliente_to_lead()
RETURNS TRIGGER AS $$
BEGIN
  -- Try to link by email first
  IF NEW.email IS NOT NULL THEN
    SELECT id INTO NEW.lead_id
    FROM leads
    WHERE LOWER(TRIM(email)) = LOWER(TRIM(NEW.email))
    LIMIT 1;
  END IF;

  -- If no match by email, try by phone
  IF NEW.lead_id IS NULL AND NEW.telefone IS NOT NULL THEN
    SELECT id INTO NEW.lead_id
    FROM leads
    WHERE LOWER(TRIM(REPLACE(REPLACE(REPLACE(telefone, ' ', ''), '-', ''), '(', ''))) = 
          LOWER(TRIM(REPLACE(REPLACE(REPLACE(NEW.telefone, ' ', ''), '-', ''), '(', '')))
    LIMIT 1;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-link new clients
DROP TRIGGER IF EXISTS trigger_link_cliente_to_lead ON clientes;
CREATE TRIGGER trigger_link_cliente_to_lead
  BEFORE INSERT ON clientes
  FOR EACH ROW
  EXECUTE FUNCTION link_cliente_to_lead();

-- Add comment to document the relationship
COMMENT ON COLUMN clientes.lead_id IS 'Foreign key para tabela leads - vincula cliente à origem do lead (matched por email ou telefone)';