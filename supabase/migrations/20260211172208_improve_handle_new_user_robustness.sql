/*
  # Improve handle_new_user function robustness
  
  1. Changes
    - Add exception handling to prevent trigger failures from blocking auth
    - Add SET search_path for security
    - Ensure function can complete even if user_profiles insert fails
  
  2. Security
    - Maintains SECURITY DEFINER to bypass RLS
    - Sets search_path to prevent SQL injection
*/

-- Drop and recreate the function with better error handling
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Try to insert user profile, but don't fail if there's an error
  BEGIN
    INSERT INTO public.user_profiles (id, email, is_master)
    VALUES (
      NEW.id,
      NEW.email,
      false
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION
    WHEN OTHERS THEN
      -- Log the error but don't prevent user creation
      RAISE WARNING 'Failed to create user profile for %: %', NEW.email, SQLERRM;
  END;
  
  RETURN NEW;
END;
$$;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres, anon, authenticated, service_role;
