/*
  # Add Postback Tracking to Clientes Table

  1. Changes
    - Add `postback_enviado` column (boolean, default false) to track if postback was sent
    - Add `postback_enviado_em` column (timestamptz) to track when postback was sent
  
  2. Purpose
    - Prevent duplicate postback sends
    - Track postback history
    - Provide visual feedback in UI when postback already sent
*/

DO $$
BEGIN
  -- Add postback_enviado column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clientes' AND column_name = 'postback_enviado'
  ) THEN
    ALTER TABLE clientes ADD COLUMN postback_enviado boolean DEFAULT false;
  END IF;

  -- Add postback_enviado_em column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clientes' AND column_name = 'postback_enviado_em'
  ) THEN
    ALTER TABLE clientes ADD COLUMN postback_enviado_em timestamptz;
  END IF;
END $$;