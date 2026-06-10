/*
  # WhatsApp Contact Name Cache

  1. New Table
    - `whatsapp_contact_cache`
      - `jid` (text, primary key): WhatsApp JID (e.g., 5511999999999@s.whatsapp.net)
      - `name` (text): Contact name from pushName or profile
      - `phone_normalized` (text): Normalized phone number for CRM matching
      - `source` (text): Where the name came from (pushname, profile, crm)
      - `updated_at` (timestamptz): Last update timestamp

  2. Security
    - Enable RLS
    - Allow authenticated users full access
*/

CREATE TABLE IF NOT EXISTS whatsapp_contact_cache (
  jid text PRIMARY KEY,
  name text NOT NULL,
  phone_normalized text,
  source text NOT NULL DEFAULT 'pushname',
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_contact_cache_phone ON whatsapp_contact_cache(phone_normalized);

ALTER TABLE whatsapp_contact_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read contact cache"
  ON whatsapp_contact_cache
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert contact cache"
  ON whatsapp_contact_cache
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update contact cache"
  ON whatsapp_contact_cache
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete contact cache"
  ON whatsapp_contact_cache
  FOR DELETE
  TO authenticated
  USING (true);
