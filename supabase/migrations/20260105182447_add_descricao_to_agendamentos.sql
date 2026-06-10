/*
  # Add descricao column to agendamentos

  1. Changes
    - Add `descricao` column to `agendamentos` table
      - Type: text
      - Nullable: true (optional description for appointments)
  
  2. Notes
    - This column allows users to add descriptive notes when scheduling appointments
    - Used when completing appointments to create call records with descriptions
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agendamentos' AND column_name = 'descricao'
  ) THEN
    ALTER TABLE agendamentos ADD COLUMN descricao text;
  END IF;
END $$;