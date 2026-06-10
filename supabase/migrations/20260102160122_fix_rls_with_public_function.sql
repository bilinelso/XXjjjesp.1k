/*
  # Fix RLS with Security Definer Function

  ## Problem
  The RLS policies had potential for recursion when checking is_master status
  because SELECT queries within policies trigger RLS again.

  ## Solution
  Create a security definer function in the public schema that bypasses RLS 
  to check if the current user is a master. This function runs with elevated 
  privileges and doesn't trigger RLS policies.

  ## Changes
  1. Create public.is_current_user_master() function that bypasses RLS
  2. Update all policies to use this function instead of subqueries
  3. This completely eliminates any possibility of recursion
*/

-- Create a security definer function to check if user is master
CREATE OR REPLACE FUNCTION public.is_current_user_master()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(
    (SELECT is_master FROM public.user_profiles WHERE id = auth.uid() LIMIT 1),
    false
  );
$$;

-- Drop all existing policies
DROP POLICY IF EXISTS "Users can read own profile" ON user_profiles;
DROP POLICY IF EXISTS "Master can read all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Master can insert profiles" ON user_profiles;
DROP POLICY IF EXISTS "Master can update profiles" ON user_profiles;
DROP POLICY IF EXISTS "Master can delete profiles" ON user_profiles;

-- Users can always read their own profile
CREATE POLICY "Users can read own profile"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Master users can read all profiles
CREATE POLICY "Master can read all profiles"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (public.is_current_user_master() = true AND auth.uid() != id);

-- Master users can insert profiles
CREATE POLICY "Master can insert profiles"
  ON user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_current_user_master() = true);

-- Master users can update profiles
CREATE POLICY "Master can update profiles"
  ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (public.is_current_user_master() = true)
  WITH CHECK (public.is_current_user_master() = true);

-- Master users can delete profiles
CREATE POLICY "Master can delete profiles"
  ON user_profiles
  FOR DELETE
  TO authenticated
  USING (public.is_current_user_master() = true);
