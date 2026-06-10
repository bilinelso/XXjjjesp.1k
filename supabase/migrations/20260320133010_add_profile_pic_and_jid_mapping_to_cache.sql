/*
  # Add Profile Picture Cache and JID Mapping

  1. Changes to whatsapp_contact_cache
    - Add `profile_pic_url` column for cached profile pictures
    - Add `real_phone` column to store actual phone number for @lid JIDs
    - Add `linked_jid` column to link @lid JIDs to real phone JIDs

  2. Purpose
    - Cache profile pictures to avoid repeated API calls
    - Map @lid JIDs to real phone numbers for better contact matching
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'whatsapp_contact_cache' AND column_name = 'profile_pic_url'
  ) THEN
    ALTER TABLE whatsapp_contact_cache ADD COLUMN profile_pic_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'whatsapp_contact_cache' AND column_name = 'real_phone'
  ) THEN
    ALTER TABLE whatsapp_contact_cache ADD COLUMN real_phone text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'whatsapp_contact_cache' AND column_name = 'linked_jid'
  ) THEN
    ALTER TABLE whatsapp_contact_cache ADD COLUMN linked_jid text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'whatsapp_contact_cache' AND column_name = 'profile_pic_updated_at'
  ) THEN
    ALTER TABLE whatsapp_contact_cache ADD COLUMN profile_pic_updated_at timestamptz;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_whatsapp_contact_cache_real_phone ON whatsapp_contact_cache(real_phone);
CREATE INDEX IF NOT EXISTS idx_whatsapp_contact_cache_linked_jid ON whatsapp_contact_cache(linked_jid);