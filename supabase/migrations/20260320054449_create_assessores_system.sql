/*
  # Create Assessores Management System

  1. New Tables
    - `assessores`
      - `id` (uuid, primary key)
      - `nome` (text, unique) - assessor name
      - `ativo` (boolean) - whether assessor is active/available for selection
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `cliente_assessores`
      - `id` (uuid, primary key)
      - `cliente_id` (uuid, foreign key to clientes)
      - `assessor_id` (uuid, foreign key to assessores)
      - `created_at` (timestamptz)
      - Unique constraint on (cliente_id, assessor_id)

  2. Data Migration
    - Extract unique assessor names from existing clientes.assessor field
    - Parse names separated by "/" as multiple assessors
    - Create assessor records for each unique name
    - Create relationships in cliente_assessores

  3. Security
    - Enable RLS on both tables
    - Add policies for authenticated users
*/

-- Create assessores table
CREATE TABLE IF NOT EXISTS assessores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text UNIQUE NOT NULL,
  ativo boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE assessores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read assessores"
  ON assessores FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert assessores"
  ON assessores FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update assessores"
  ON assessores FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete assessores"
  ON assessores FOR DELETE
  TO authenticated
  USING (true);

-- Create cliente_assessores junction table
CREATE TABLE IF NOT EXISTS cliente_assessores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  assessor_id uuid NOT NULL REFERENCES assessores(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(cliente_id, assessor_id)
);

CREATE INDEX IF NOT EXISTS idx_cliente_assessores_cliente ON cliente_assessores(cliente_id);
CREATE INDEX IF NOT EXISTS idx_cliente_assessores_assessor ON cliente_assessores(assessor_id);

ALTER TABLE cliente_assessores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read cliente_assessores"
  ON cliente_assessores FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert cliente_assessores"
  ON cliente_assessores FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update cliente_assessores"
  ON cliente_assessores FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete cliente_assessores"
  ON cliente_assessores FOR DELETE
  TO authenticated
  USING (true);

-- Function to normalize assessor name for comparison
CREATE OR REPLACE FUNCTION normalize_assessor_name(name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN lower(trim(
    translate(
      name,
      'áàâãäéèêëíìîïóòôõöúùûüÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜçÇñÑ',
      'aaaaaeeeeiiiiooooouuuuAAAAAEEEEIIIIOOOOOUUUUcCnN'
    )
  ));
END;
$$;

-- Function to capitalize assessor name
CREATE OR REPLACE FUNCTION capitalize_assessor_name(name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  result text;
  trimmed text;
BEGIN
  trimmed := trim(name);
  IF trimmed = '' THEN
    RETURN '';
  END IF;
  result := upper(substring(trimmed from 1 for 1)) || lower(substring(trimmed from 2));
  RETURN result;
END;
$$;

-- Migrate existing data: extract unique assessor names and create records
DO $$
DECLARE
  assessor_record RECORD;
  assessor_name text;
  assessor_names text[];
  normalized_name text;
  capitalized_name text;
  existing_assessor_id uuid;
  new_assessor_id uuid;
  cliente_record RECORD;
BEGIN
  -- First pass: collect all unique assessor names
  FOR assessor_record IN 
    SELECT DISTINCT assessor 
    FROM clientes 
    WHERE assessor IS NOT NULL AND assessor != ''
  LOOP
    -- Split by "/" to handle multiple assessors
    assessor_names := string_to_array(assessor_record.assessor, '/');
    
    FOREACH assessor_name IN ARRAY assessor_names
    LOOP
      -- Clean up the name
      assessor_name := trim(assessor_name);
      IF assessor_name != '' THEN
        normalized_name := normalize_assessor_name(assessor_name);
        capitalized_name := capitalize_assessor_name(assessor_name);
        
        -- Check if assessor already exists (by normalized name)
        SELECT id INTO existing_assessor_id 
        FROM assessores 
        WHERE normalize_assessor_name(nome) = normalized_name
        LIMIT 1;
        
        IF existing_assessor_id IS NULL THEN
          INSERT INTO assessores (nome, ativo)
          VALUES (capitalized_name, true);
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  -- Second pass: create relationships
  FOR cliente_record IN 
    SELECT id, assessor 
    FROM clientes 
    WHERE assessor IS NOT NULL AND assessor != ''
  LOOP
    assessor_names := string_to_array(cliente_record.assessor, '/');
    
    FOREACH assessor_name IN ARRAY assessor_names
    LOOP
      assessor_name := trim(assessor_name);
      IF assessor_name != '' THEN
        normalized_name := normalize_assessor_name(assessor_name);
        
        -- Find the assessor
        SELECT id INTO existing_assessor_id 
        FROM assessores 
        WHERE normalize_assessor_name(nome) = normalized_name
        LIMIT 1;
        
        IF existing_assessor_id IS NOT NULL THEN
          -- Create relationship if it doesn't exist
          INSERT INTO cliente_assessores (cliente_id, assessor_id)
          VALUES (cliente_record.id, existing_assessor_id)
          ON CONFLICT (cliente_id, assessor_id) DO NOTHING;
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

-- Create trigger to update updated_at on assessores
CREATE OR REPLACE FUNCTION update_assessores_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER assessores_updated_at
  BEFORE UPDATE ON assessores
  FOR EACH ROW
  EXECUTE FUNCTION update_assessores_updated_at();
