/*
  # WhatsApp JID Mapping Cache
  
  1. New Tables
    - `whatsapp_jid_mapping`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to users)
      - `phone_number` (text) - normalized phone number
      - `canonical_jid` (text) - the canonical JID to use (e.g., 5511999999999@s.whatsapp.net)
      - `alternate_jids` (text[]) - other JIDs for the same number (e.g., 5511999999999@lid)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
  
  2. Security
    - Enable RLS on `whatsapp_jid_mapping` table
    - Add policy for users to read their own mappings
*/

CREATE TABLE IF NOT EXISTS whatsapp_jid_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  canonical_jid text NOT NULL,
  alternate_jids text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, phone_number)
);

ALTER TABLE whatsapp_jid_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own JID mappings"
  ON whatsapp_jid_mapping FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own JID mappings"
  ON whatsapp_jid_mapping FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own JID mappings"
  ON whatsapp_jid_mapping FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_whatsapp_jid_mapping_user_phone
  ON whatsapp_jid_mapping(user_id, phone_number);

CREATE INDEX idx_whatsapp_jid_mapping_canonical_jid
  ON whatsapp_jid_mapping(user_id, canonical_jid);
