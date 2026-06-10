/*
  # Remove auth trigger temporarily to debug login issues
  
  1. Changes
    - Drop the on_auth_user_created trigger from auth.users table
    - Keep the handle_new_user function for future use
  
  2. Rationale
    - The trigger may be causing 500 errors during login
    - User profiles are already created for existing users
    - New users can be created manually or via edge function
*/

-- Drop the trigger from auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
