/*
  # Sync user_profiles.assessor_id with assessores.user_id

  New users already get an assessor row linked by assessores.user_id.
  This migration backfills user_profiles.assessor_id and keeps it in sync
  whenever an assessor is linked to a user.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'assessores'
      AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.assessores
      ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_profiles'
      AND column_name = 'assessor_id'
  ) THEN
    ALTER TABLE public.user_profiles
      ADD COLUMN assessor_id uuid REFERENCES public.assessores(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_assessores_user_id
  ON public.assessores(user_id);

CREATE INDEX IF NOT EXISTS idx_user_profiles_assessor_id
  ON public.user_profiles(assessor_id);

WITH profiles_without_assessor AS (
  SELECT
    up.id,
    up.email,
    initcap(replace(split_part(up.email, '@', 1), '.', ' ')) AS display_name
  FROM public.user_profiles up
  WHERE up.assessor_id IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.assessores a
      WHERE a.user_id = up.id
    )
)
INSERT INTO public.assessores (nome, ativo, user_id)
SELECT
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.assessores a
      WHERE lower(a.nome) = lower(p.display_name)
    )
      THEN p.display_name || ' (' || left(p.id::text, 8) || ')'
    ELSE p.display_name
  END,
  true,
  p.id
FROM profiles_without_assessor p;

UPDATE public.assessores a
SET user_id = up.id
FROM public.user_profiles up
WHERE up.assessor_id = a.id
  AND a.user_id IS NULL;

WITH assessor_by_user AS (
  SELECT DISTINCT ON (user_id) id, user_id
  FROM public.assessores
  WHERE user_id IS NOT NULL
  ORDER BY user_id, created_at ASC
)
UPDATE public.user_profiles up
SET assessor_id = abu.id,
    updated_at = now()
FROM assessor_by_user abu
WHERE up.id = abu.user_id
  AND up.assessor_id IS DISTINCT FROM abu.id;

INSERT INTO public.assessor_availability (assessor_id, is_available)
SELECT a.id, true
FROM public.assessores a
WHERE a.user_id IS NOT NULL
ON CONFLICT (assessor_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.sync_user_profile_assessor_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    UPDATE public.user_profiles
    SET assessor_id = NEW.id,
        updated_at = now()
    WHERE id = NEW.user_id
      AND assessor_id IS DISTINCT FROM NEW.id;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.user_id IS NOT NULL
    AND OLD.user_id IS DISTINCT FROM NEW.user_id
  THEN
    UPDATE public.user_profiles
    SET assessor_id = NULL,
        updated_at = now()
    WHERE id = OLD.user_id
      AND assessor_id = OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_user_profile_assessor_id_on_assessores
  ON public.assessores;

CREATE TRIGGER sync_user_profile_assessor_id_on_assessores
  AFTER INSERT OR UPDATE OF user_id
  ON public.assessores
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_user_profile_assessor_id();
