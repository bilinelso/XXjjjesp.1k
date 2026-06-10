/*
  # Bypass RLS for auth admin
  
  1. Changes
    - Grant BYPASSRLS to supabase_auth_admin for user_profiles table operations
    - This allows Supabase Auth to function without RLS restrictions
  
  2. Security
    - supabase_auth_admin is a trusted Supabase internal role
    - This is necessary for authentication to work correctly
*/

-- Allow supabase_auth_admin to bypass RLS on user_profiles
-- Note: We can't grant BYPASSRLS directly, so we create a specific policy

CREATE POLICY "Auth admin can read all profiles"
  ON user_profiles
  FOR SELECT
  TO supabase_auth_admin
  USING (true);
