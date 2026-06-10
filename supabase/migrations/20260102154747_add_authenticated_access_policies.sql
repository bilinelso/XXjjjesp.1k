/*
  # Add Authenticated User Access Policies

  1. Changes
    - Add policies to allow authenticated users to access all CRM data
    - Maintain existing anonymous access policies for backward compatibility
    - Ensure authenticated users can perform all CRUD operations

  2. Tables Updated
    - clientes: Add authenticated user policies
    - ligacoes: Add authenticated user policies
    - agendamentos: Add authenticated user policies
    - compras: Add authenticated user policies
    - problemas: Add authenticated user policies
    - leads: Add authenticated user policies

  3. Security
    - All authenticated users can access all data
    - This matches the requirement that data is visible across all functionalities
    - View access restrictions are handled at the application level
*/

-- Policies for clientes
CREATE POLICY "Allow SELECT for authenticated users on clientes"
  ON clientes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow INSERT for authenticated users on clientes"
  ON clientes FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow UPDATE for authenticated users on clientes"
  ON clientes FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow DELETE for authenticated users on clientes"
  ON clientes FOR DELETE
  TO authenticated
  USING (true);

-- Policies for ligacoes
CREATE POLICY "Allow SELECT for authenticated users on ligacoes"
  ON ligacoes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow INSERT for authenticated users on ligacoes"
  ON ligacoes FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow UPDATE for authenticated users on ligacoes"
  ON ligacoes FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow DELETE for authenticated users on ligacoes"
  ON ligacoes FOR DELETE
  TO authenticated
  USING (true);

-- Policies for agendamentos
CREATE POLICY "Allow SELECT for authenticated users on agendamentos"
  ON agendamentos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow INSERT for authenticated users on agendamentos"
  ON agendamentos FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow UPDATE for authenticated users on agendamentos"
  ON agendamentos FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow DELETE for authenticated users on agendamentos"
  ON agendamentos FOR DELETE
  TO authenticated
  USING (true);

-- Policies for compras
CREATE POLICY "Allow SELECT for authenticated users on compras"
  ON compras FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow INSERT for authenticated users on compras"
  ON compras FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow UPDATE for authenticated users on compras"
  ON compras FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow DELETE for authenticated users on compras"
  ON compras FOR DELETE
  TO authenticated
  USING (true);

-- Policies for problemas
CREATE POLICY "Allow SELECT for authenticated users on problemas"
  ON problemas FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow INSERT for authenticated users on problemas"
  ON problemas FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow UPDATE for authenticated users on problemas"
  ON problemas FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow DELETE for authenticated users on problemas"
  ON problemas FOR DELETE
  TO authenticated
  USING (true);

-- Policies for leads
CREATE POLICY "Allow SELECT for authenticated users on leads"
  ON leads FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow INSERT for authenticated users on leads"
  ON leads FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow UPDATE for authenticated users on leads"
  ON leads FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow DELETE for authenticated users on leads"
  ON leads FOR DELETE
  TO authenticated
  USING (true);
