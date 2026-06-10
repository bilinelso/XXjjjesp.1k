/*
  # Fix is_current_user_master function security
  
  1. Changes
    - Add SET search_path to is_current_user_master function
    - This prevents potential security issues and ensures the function works correctly
  
  2. Security
    - SECURITY DEFINER functions must have SET search_path to prevent privilege escalation
*/

-- Recreate the function with proper search_path
CREATE OR REPLACE FUNCTION public.is_current_user_master()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT COALESCE(
    (SELECT is_master FROM public.user_profiles WHERE id = auth.uid() LIMIT 1),
    false
  );
$$;
