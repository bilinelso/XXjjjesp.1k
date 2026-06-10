/*
  # Disable RLS on public.users table temporarily
  
  1. Changes
    - Disable RLS on public.users to see if this is causing auth issues
    - This is a temporary measure to debug the auth problem
  
  2. Rationale
    - The public.users table may be conflicting with Supabase Auth
    - Disabling RLS temporarily will help identify if this is the issue
*/

-- Disable RLS on public.users
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
