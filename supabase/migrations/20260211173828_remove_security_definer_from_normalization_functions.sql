/*
  # Remove SECURITY DEFINER from normalization functions
  
  1. Changes
    - Remove SECURITY DEFINER from normalize_email, normalize_name, and normalize_phone
    - These functions don't access tables, so they don't need elevated privileges
    - This should fix the 500 errors when accessing tables via REST API
  
  2. Security
    - Functions remain IMMUTABLE for use in generated columns
    - No security risk as functions only perform string transformations
*/

-- Recreate normalize_email without SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.normalize_email(email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF email IS NULL OR TRIM(email) = '' THEN
    RETURN NULL;
  END IF;
  
  RETURN LOWER(TRIM(REGEXP_REPLACE(email, '\s+', '', 'g')));
END;
$$;

-- Recreate normalize_name without SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.normalize_name(name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF name IS NULL OR TRIM(name) = '' THEN
    RETURN NULL;
  END IF;
  
  RETURN LOWER(TRIM(REGEXP_REPLACE(public.unaccent(name), '\s+', ' ', 'g')));
END;
$$;

-- Recreate normalize_phone without SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.normalize_phone(phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
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
