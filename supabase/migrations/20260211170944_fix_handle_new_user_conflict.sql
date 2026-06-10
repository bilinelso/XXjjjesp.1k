/*
  # Fix handle_new_user function to prevent duplicate key violations
  
  1. Changes
    - Update handle_new_user() function to use ON CONFLICT DO NOTHING
    - This prevents errors when user_profiles already exists for a user
    - Ensures login doesn't fail with error 500
  
  2. Security
    - No changes to RLS policies
    - Function maintains same security model
*/

-- Drop and recreate the function with proper conflict handling
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert user profile, but ignore if already exists
  INSERT INTO public.user_profiles (id, email, is_master)
  VALUES (
    NEW.id,
    NEW.email,
    false
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
END;
$$;
