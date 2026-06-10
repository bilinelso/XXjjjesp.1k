/*
  # Add tipo_origem field to ligacoes table

  1. Changes
    - Add `tipo_origem` column to ligacoes table to distinguish between manual entries and completed appointments
    - Add `agendamento_id` column to link ligacoes to their source agendamento (if applicable)
    - Add `observacao_agendamento` to store additional appointment completion notes
    
  2. Field Details
    - `tipo_origem`: Either 'manual' (created through "Novo registro") or 'agendamento' (created from completed appointment)
    - `agendamento_id`: Foreign key reference to agendamentos table (nullable)
    - `observacao_agendamento`: Additional notes when completing an appointment (nullable)
    
  3. Business Logic
    - Manual entries have tipo_origem = 'manual' and agendamento_id = NULL
    - Completed appointments have tipo_origem = 'agendamento' and agendamento_id pointing to source
    - UI will display these differently for better UX
*/

-- Add tipo_origem column to distinguish entry type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ligacoes' AND column_name = 'tipo_origem'
  ) THEN
    ALTER TABLE ligacoes ADD COLUMN tipo_origem text NOT NULL DEFAULT 'manual' CHECK (tipo_origem IN ('manual', 'agendamento'));
  END IF;
END $$;

-- Add agendamento_id to link back to source appointment
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ligacoes' AND column_name = 'agendamento_id'
  ) THEN
    ALTER TABLE ligacoes ADD COLUMN agendamento_id uuid REFERENCES agendamentos(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add observacao_agendamento for additional notes on appointment completion
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ligacoes' AND column_name = 'observacao_agendamento'
  ) THEN
    ALTER TABLE ligacoes ADD COLUMN observacao_agendamento text;
  END IF;
END $$;

-- Create index on agendamento_id for faster queries
CREATE INDEX IF NOT EXISTS idx_ligacoes_agendamento_id ON ligacoes(agendamento_id);

-- Create index on tipo_origem for filtering
CREATE INDEX IF NOT EXISTS idx_ligacoes_tipo_origem ON ligacoes(tipo_origem);
