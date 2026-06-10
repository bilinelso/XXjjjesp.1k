/*
  # Add UNIQUE constraint to whatsapp_contact_cache.jid

  1. Changes
    - `whatsapp_contact_cache`
      - Add UNIQUE constraint on `jid` column to allow upsert operations

  2. Notes
    - Uses DO block to safely add constraint only if it doesn't exist
    - Required to support ON CONFLICT upserts on the jid field
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'whatsapp_contact_cache'
    AND constraint_name = 'whatsapp_contact_cache_jid_key'
    AND constraint_type = 'UNIQUE'
  ) THEN
    ALTER TABLE whatsapp_contact_cache ADD CONSTRAINT whatsapp_contact_cache_jid_key UNIQUE (jid);
  END IF;
END $$;
