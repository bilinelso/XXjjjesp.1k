/*
  # Fix RLS Policies for Anonymous Access

  ## Changes
  This migration adds policies to allow anonymous (unauthenticated) users to access
  the CRM data. This is necessary because the app currently doesn't have authentication.

  ## Security Note
  In a production environment, you should implement proper authentication and use
  role-based access control. For now, this allows the app to function.

  ## Tables Updated
  - clientes: Allow anon users to SELECT, INSERT, UPDATE, DELETE
  - ligacoes: Allow anon users to SELECT, INSERT, UPDATE, DELETE
  - agendamentos: Allow anon users to SELECT, INSERT, UPDATE, DELETE
  - compras: Allow anon users to SELECT, INSERT, UPDATE, DELETE
  - problemas: Allow anon users to SELECT, INSERT, UPDATE, DELETE
  - leads: Allow anon users to SELECT, INSERT, UPDATE, DELETE
*/

-- Drop existing policies and create new ones that allow anonymous access

-- Policies for clientes
DROP POLICY IF EXISTS "Allow all operations for authenticated users on clientes" ON clientes;

CREATE POLICY "Allow SELECT for anon users on clientes"
  ON clientes FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow INSERT for anon users on clientes"
  ON clientes FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow UPDATE for anon users on clientes"
  ON clientes FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow DELETE for anon users on clientes"
  ON clientes FOR DELETE
  TO anon
  USING (true);

-- Policies for ligacoes
DROP POLICY IF EXISTS "Allow all operations for authenticated users on ligacoes" ON ligacoes;

CREATE POLICY "Allow SELECT for anon users on ligacoes"
  ON ligacoes FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow INSERT for anon users on ligacoes"
  ON ligacoes FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow UPDATE for anon users on ligacoes"
  ON ligacoes FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow DELETE for anon users on ligacoes"
  ON ligacoes FOR DELETE
  TO anon
  USING (true);

-- Policies for agendamentos
DROP POLICY IF EXISTS "Allow all operations for authenticated users on agendamentos" ON agendamentos;

CREATE POLICY "Allow SELECT for anon users on agendamentos"
  ON agendamentos FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow INSERT for anon users on agendamentos"
  ON agendamentos FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow UPDATE for anon users on agendamentos"
  ON agendamentos FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow DELETE for anon users on agendamentos"
  ON agendamentos FOR DELETE
  TO anon
  USING (true);

-- Policies for compras
DROP POLICY IF EXISTS "Allow all operations for authenticated users on compras" ON compras;

CREATE POLICY "Allow SELECT for anon users on compras"
  ON compras FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow INSERT for anon users on compras"
  ON compras FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow UPDATE for anon users on compras"
  ON compras FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow DELETE for anon users on compras"
  ON compras FOR DELETE
  TO anon
  USING (true);

-- Policies for problemas
DROP POLICY IF EXISTS "Allow all operations for authenticated users on problemas" ON problemas;

CREATE POLICY "Allow SELECT for anon users on problemas"
  ON problemas FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow INSERT for anon users on problemas"
  ON problemas FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow UPDATE for anon users on problemas"
  ON problemas FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow DELETE for anon users on problemas"
  ON problemas FOR DELETE
  TO anon
  USING (true);

-- Policies for leads table
CREATE POLICY "Allow SELECT for anon users on leads"
  ON leads FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow INSERT for anon users on leads"
  ON leads FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow UPDATE for anon users on leads"
  ON leads FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow DELETE for anon users on leads"
  ON leads FOR DELETE
  TO anon
  USING (true);
