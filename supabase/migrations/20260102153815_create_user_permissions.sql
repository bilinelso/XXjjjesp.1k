/*
  # User Permissions and Authentication System

  1. New Tables
    - `user_profiles`
      - `id` (uuid, primary key, references auth.users)
      - `email` (text, unique)
      - `is_master` (boolean) - Master admin account
      - `can_access_leads` (boolean) - Access to Leads view
      - `can_access_dashboard` (boolean) - Access to Dashboard view
      - `can_access_kanban` (boolean) - Access to Kanban view
      - `can_access_agendamentos` (boolean) - Access to Agendamentos view
      - `can_access_config` (boolean) - Access to Config view
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `user_profiles` table
    - Users can read their own profile
    - Only master users can create/update/delete profiles
    - Master users can read all profiles

  3. Important Notes
    - Master account will be created separately via Supabase Auth
    - All access flags default to false for security
    - Master account has all permissions automatically
*/

CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  is_master boolean DEFAULT false,
  can_access_leads boolean DEFAULT false,
  can_access_dashboard boolean DEFAULT false,
  can_access_kanban boolean DEFAULT false,
  can_access_agendamentos boolean DEFAULT false,
  can_access_config boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Master users can read all profiles"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_master = true
    )
  );

CREATE POLICY "Master users can insert profiles"
  ON user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_master = true
    )
  );

CREATE POLICY "Master users can update profiles"
  ON user_profiles
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

CREATE POLICY "Master users can delete profiles"
  ON user_profiles
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_master = true
    )
  );

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, is_master)
  VALUES (
    NEW.id,
    NEW.email,
    false
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created'
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION handle_new_user();
  END IF;
END $$;