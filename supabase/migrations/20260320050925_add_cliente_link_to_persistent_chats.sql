/*
  # Link Persistent Chats to Clientes

  1. Changes
    - Add `cliente_id` column to `persistent_chats` table
    - This allows linking WhatsApp conversations to CRM clients
    - Add index for faster lookups by cliente_id

  2. Function
    - Create function to find cliente by phone number (with variants)
    - This handles the Brazilian phone number variations (with/without 9th digit)

  3. Notes
    - The cliente_id is optional - not all chats will have a linked cliente
    - The link is established automatically when messages are received
*/

-- Add cliente_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'persistent_chats' AND column_name = 'cliente_id'
  ) THEN
    ALTER TABLE persistent_chats ADD COLUMN cliente_id uuid REFERENCES clientes(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_persistent_chats_cliente_id ON persistent_chats(cliente_id);

-- Function to generate phone variants for Brazilian numbers
CREATE OR REPLACE FUNCTION get_phone_variants(phone text)
RETURNS text[]
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  cleaned text;
  ddd text;
  rest text;
  variants text[];
BEGIN
  cleaned := regexp_replace(phone, '\D', '', 'g');
  variants := ARRAY[cleaned];
  
  IF cleaned LIKE '55%' AND length(cleaned) >= 12 THEN
    ddd := substring(cleaned from 3 for 2);
    rest := substring(cleaned from 5);
    
    IF length(rest) = 9 AND rest LIKE '9%' THEN
      variants := array_append(variants, '55' || ddd || substring(rest from 2));
    ELSIF length(rest) = 8 THEN
      variants := array_append(variants, '55' || ddd || '9' || rest);
    END IF;
  END IF;
  
  RETURN variants;
END;
$$;

-- Function to find cliente by phone with variants
CREATE OR REPLACE FUNCTION find_cliente_by_phone(search_phone text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  variants text[];
  found_id uuid;
BEGIN
  variants := get_phone_variants(search_phone);
  
  SELECT id INTO found_id
  FROM clientes
  WHERE telefone_normalized = ANY(variants)
  LIMIT 1;
  
  RETURN found_id;
END;
$$;
