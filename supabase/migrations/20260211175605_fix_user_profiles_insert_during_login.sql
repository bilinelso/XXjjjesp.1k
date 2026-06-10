/*
  # Fix user profile creation during login
  
  1. Changes
    - Add policy to allow users to create their own profile during signup/login
    - This fixes the "Database error granting user" issue
  
  2. Security
    - Users can only insert a profile for themselves (id = auth.uid())
    - Master users can still insert profiles for others
*/

-- Allow users to create their own profile
CREATE POLICY "Users can create own profile"
  ON user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);
