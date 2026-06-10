/*
  # Fix auth admin access to public.users table
  
  1. Changes
    - Grant permissions to supabase_auth_admin on public.users table
    - Add RLS policy for auth admin to access public.users
  
  2. Security
    - supabase_auth_admin is a trusted Supabase internal role
    - This prevents auth errors during login process
*/

-- Grant SELECT permission to auth admin on public.users
GRANT SELECT ON public.users TO supabase_auth_admin;

-- Add RLS policy for auth admin to read public.users
CREATE POLICY "Auth admin can read users"
  ON public.users
  FOR SELECT
  TO supabase_auth_admin
  USING (true);
