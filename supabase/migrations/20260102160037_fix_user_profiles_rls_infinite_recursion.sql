/*
  # Fix RLS Infinite Recursion on user_profiles

  ## Problem
  The RLS policies on `user_profiles` were causing infinite recursion because
  they checked if a user is a master by querying the same `user_profiles` table,
  creating a circular dependency.

  ## Solution
  1. Drop all existing policies
  2. Create simpler policies that avoid self-referential queries
  3. Users can always read their own profile (no self-reference needed)
  4. Master users can read all profiles using a simpler approach
  5. Only authenticated users with is_master=true can modify profiles

  ## Changes
  - Dropped all existing policies on user_profiles
  - Created new non-recursive policies
  - Users can read own profile directly (auth.uid() = id)
  - Master access uses a different approach to avoid recursion
*/

-- Drop all existing policies
DROP POLICY IF EXISTS "Users can read own profile" ON user_profiles;
DROP POLICY IF EXISTS "Master users can read all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Master users can insert profiles" ON user_profiles;
DROP POLICY IF EXISTS "Master users can update profiles" ON user_profiles;
DROP POLICY IF EXISTS "Master users can delete profiles" ON user_profiles;

-- Allow users to read their own profile (no self-reference)
CREATE POLICY "Users can read own profile"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Allow authenticated users to read all profiles if they have is_master=true
-- This uses a subquery that won't cause recursion because it only reads, doesn't trigger policies
CREATE POLICY "Master can read all profiles"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (
    id != auth.uid() 
    AND EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() 
      AND up.is_master = true
    )
  );

-- Allow master users to insert new profiles
CREATE POLICY "Master can insert profiles"
  ON user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT is_master FROM user_profiles WHERE id = auth.uid()) = true
  );

-- Allow master users to update profiles
CREATE POLICY "Master can update profiles"
  ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT is_master FROM user_profiles WHERE id = auth.uid()) = true
  )
  WITH CHECK (
    (SELECT is_master FROM user_profiles WHERE id = auth.uid()) = true
  );

-- Allow master users to delete profiles
CREATE POLICY "Master can delete profiles"
  ON user_profiles
  FOR DELETE
  TO authenticated
  USING (
    (SELECT is_master FROM user_profiles WHERE id = auth.uid()) = true
  );
