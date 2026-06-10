/*
  # Grant auth admin access to user_profiles
  
  1. Changes
    - Grant necessary permissions to supabase_auth_admin role
    - This allows Supabase Auth to read user_profiles during authentication
  
  2. Security
    - supabase_auth_admin is a trusted Supabase internal role
    - This permission is necessary for authentication to work correctly
*/

-- Grant permissions to supabase_auth_admin
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT SELECT ON public.user_profiles TO supabase_auth_admin;

-- Also ensure the authenticator role has necessary permissions
GRANT USAGE ON SCHEMA public TO authenticator;
