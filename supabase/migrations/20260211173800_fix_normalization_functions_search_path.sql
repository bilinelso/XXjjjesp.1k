/*
  # Fix normalization functions with proper search_path
  
  1. Changes
    - Recreate normalize_email, normalize_name, and normalize_phone with SET search_path
    - This prevents security issues when functions are used in generated columns
    - Ensures functions work correctly with Supabase REST API
  
  2. Security
    - SET search_path prevents SQL injection risks
    - Functions remain IMMUTABLE for use in generated columns
*/

-- Recreate normalize_email with search_path
CREATE OR REPLACE FUNCTION public.normalize_email(email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF email IS NULL OR TRIM(email) = '' THEN
    RETURN NULL;
  END IF;
  
  RETURN LOWER(TRIM(REGEXP_REPLACE(email, '\s+', '', 'g')));
END;
$$;

-- Recreate normalize_name with search_path
CREATE OR REPLACE FUNCTION public.normalize_name(name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF name IS NULL OR TRIM(name) = '' THEN
    RETURN NULL;
  END IF;
  
  RETURN LOWER(TRIM(REGEXP_REPLACE(unaccent(name), '\s+', ' ', 'g')));
END;
$$;

-- Recreate normalize_phone with search_path
CREATE OR REPLACE FUNCTION public.normalize_phone(phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  cleaned TEXT;
BEGIN
  IF phone IS NULL OR TRIM(phone) = '' THEN
    RETURN NULL;
  END IF;
  
  -- Remove todos caracteres não-numéricos
  cleaned := REGEXP_REPLACE(phone, '[^0-9]', '', 'g');
  
  -- Se começa com 55 (código do Brasil) e tem mais de 11 dígitos, remove o 55
  IF LENGTH(cleaned) > 11 AND LEFT(cleaned, 2) = '55' THEN
    cleaned := SUBSTRING(cleaned FROM 3);
  END IF;
  
  -- Se ainda tem mais de 11 dígitos, pega apenas os últimos 11
  IF LENGTH(cleaned) > 11 THEN
    cleaned := RIGHT(cleaned, 11);
  END IF;
  
  RETURN cleaned;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.normalize_email(TEXT) TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.normalize_name(TEXT) TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.normalize_phone(TEXT) TO postgres, anon, authenticated, service_role;
