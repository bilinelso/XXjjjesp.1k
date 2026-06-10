/*
  # WhatsApp Permission and Evolution API Configuration

  1. Changes to `user_profiles`
    - Add `can_access_whatsapp` (boolean, default false) - permission to access WhatsApp tab

  2. New Tables
    - `evolution_api_config`
      - `id` (uuid, primary key)
      - `server_url` (text) - URL of the Evolution API server
      - `api_key` (text) - Global API key for Evolution API
      - `instance_name` (text) - Name of the WhatsApp instance
      - `instance_connected` (boolean) - Whether the instance is currently connected
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  3. Security
    - Enable RLS on `evolution_api_config` table
    - Master users can fully manage the config
    - Users with WhatsApp permission can read the config

  4. Notes
    - Master users automatically get WhatsApp access via is_master flag
    - The evolution_api_config table stores credentials for the self-hosted Evolution API
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'can_access_whatsapp'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN can_access_whatsapp boolean DEFAULT false;
  END IF;
END $$;

UPDATE user_profiles SET can_access_whatsapp = true WHERE is_master = true;

CREATE TABLE IF NOT EXISTS evolution_api_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_url text NOT NULL DEFAULT '',
  api_key text NOT NULL DEFAULT '',
  instance_name text NOT NULL DEFAULT 'crm-whatsapp',
  instance_connected boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE evolution_api_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Master users can read evolution config"
  ON evolution_api_config
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_master = true
    )
  );

CREATE POLICY "Master users can insert evolution config"
  ON evolution_api_config
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_master = true
    )
  );

CREATE POLICY "Master users can update evolution config"
  ON evolution_api_config
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_master = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_master = true
    )
  );

CREATE POLICY "WhatsApp users can read evolution config"
  ON evolution_api_config
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.can_access_whatsapp = true
    )
  );
