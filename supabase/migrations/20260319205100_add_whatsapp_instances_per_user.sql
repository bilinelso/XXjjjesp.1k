/*
  # WhatsApp Instances Per User

  1. New Tables
    - `whatsapp_instances`
      - `id` (uuid, primary key)
      - `user_id` (uuid, FK to user_profiles) - Owner of this WhatsApp instance
      - `instance_name` (text, unique) - Unique instance name in Evolution API
      - `phone_number` (text, nullable) - Connected phone number (extracted after connection)
      - `is_connected` (boolean) - Whether the instance is currently connected
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `whatsapp_instances` table
    - Users can only see and manage their own instance
    - Master users can see all instances

  3. Notes
    - Each user can have exactly one WhatsApp instance
    - Instance name is auto-generated based on user ID for uniqueness
    - The evolution_api_config table remains for global server configuration (URL, API key)
    - This new table tracks per-user instance connections
*/

CREATE TABLE IF NOT EXISTS whatsapp_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  instance_name text NOT NULL,
  phone_number text,
  is_connected boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT whatsapp_instances_user_id_unique UNIQUE (user_id),
  CONSTRAINT whatsapp_instances_instance_name_unique UNIQUE (instance_name)
);

ALTER TABLE whatsapp_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own WhatsApp instance"
  ON whatsapp_instances
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_master = true
    )
  );

CREATE POLICY "Users can insert own WhatsApp instance"
  ON whatsapp_instances
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own WhatsApp instance"
  ON whatsapp_instances
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own WhatsApp instance"
  ON whatsapp_instances
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_user_id ON whatsapp_instances(user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_instance_name ON whatsapp_instances(instance_name);
