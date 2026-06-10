/*
  # CRM Pós-Venda - Complete Database Schema

  ## Overview
  This migration creates the complete database structure for a post-sales CRM system
  handling client management, call tracking, appointments, and purchase history.

  ## New Tables

  ### 1. clientes (Clients)
  Core client information table storing all customer data from Hotmart webhook and manual entries.
  
  **Columns:**
  - `id` (uuid, primary key): Unique client identifier
  - `nome` (text, required): Client full name
  - `email` (text, unique, required): Client email address
  - `telefone` (text, required): Client phone number (international format supported)
  - `documento` (text, unique): CPF or international document number
  - `data_compra` (date, required): Purchase date
  - `valor_produto` (decimal): Total product value (sum of all purchases)
  - `status` (text, required): Client status in sales funnel
  - `corretora` (text): Brokerage name (manually filled by team)
  - `valor_deposito` (decimal): Deposit amount (manually filled by team)
  - `performance` (decimal): Performance percentage (manually filled by team)
  - `pais` (text): Country name
  - `pais_iso` (text): Country ISO code
  - `moeda` (text): Currency code
  - `valor_pago_moeda_original` (decimal): Amount paid in original currency
  - `subscriber_code` (text): Hotmart subscriber code
  - `hotmart_transaction_id` (text, unique): Hotmart transaction identifier
  - `created_at` (timestamptz): Record creation timestamp
  - `updated_at` (timestamptz): Last update timestamp

  **Status values:** comprou | conta-criada | depositou | acompanhamento | problema

  ### 2. ligacoes (Call History)
  Tracks all calls made to clients with descriptions and outcomes.
  
  **Columns:**
  - `id` (uuid, primary key): Unique call record identifier
  - `cliente_id` (uuid, foreign key): Reference to clientes table
  - `user_id` (uuid, nullable): User who made the call (for future use)
  - `data` (timestamptz): Call date and time
  - `descricao` (text, required): Call description/notes
  - `status` (text, required): Call outcome status
  - `created_at` (timestamptz): Record creation timestamp

  **Status values:** positivo | atencao | problema

  ### 3. agendamentos (Appointments)
  Manages scheduled calls with clients. Only one active appointment per client allowed.
  
  **Columns:**
  - `id` (uuid, primary key): Unique appointment identifier
  - `cliente_id` (uuid, foreign key): Reference to clientes table
  - `data` (date, required): Appointment date
  - `hora` (time, required): Appointment time
  - `realizado` (boolean): Whether appointment was completed
  - `user_id` (uuid, nullable): Assigned user (for future use)
  - `created_at` (timestamptz): Record creation timestamp
  - `updated_at` (timestamptz): Last update timestamp

  **Business Rule:** Only ONE active appointment (realizado = false) per client at a time

  ### 4. compras (Purchases)
  Tracks all purchases including upsells. Multiple purchases per client supported.
  
  **Columns:**
  - `id` (uuid, primary key): Unique purchase identifier
  - `cliente_id` (uuid, foreign key): Reference to clientes table
  - `produto_nome` (text, required): Product name
  - `produto_id` (integer, required): Product ID from Hotmart
  - `valor` (decimal, required): Purchase amount
  - `moeda` (text, required): Currency code
  - `hotmart_transaction_id` (text, unique, required): Transaction identifier
  - `data_compra` (date, required): Purchase date
  - `created_at` (timestamptz): Record creation timestamp

  ### 5. problemas (Issues - Future Use)
  Tracks client issues and their resolution status.
  
  **Columns:**
  - `id` (uuid, primary key): Unique issue identifier
  - `cliente_id` (uuid, foreign key): Reference to clientes table
  - `descricao` (text, required): Issue description
  - `resolvido` (boolean): Whether issue is resolved
  - `created_at` (timestamptz): Issue creation timestamp
  - `resolved_at` (timestamptz): Issue resolution timestamp

  ## Security
  
  Row Level Security (RLS) is enabled on all tables with policies allowing:
  - SELECT: All authenticated users can read data
  - INSERT: All authenticated users can create records
  - UPDATE: All authenticated users can update records
  - DELETE: All authenticated users can delete records

  Note: Currently configured for team-shared access. Future enhancement will add
  role-based access control with user-specific permissions.

  ## Indexes
  
  Indexes are created on frequently queried columns for optimal performance:
  - Client lookups by email, documento, hotmart_transaction_id, status
  - Call history by cliente_id and date
  - Appointments by cliente_id, date, and completion status
  - Purchases by cliente_id and transaction_id

  ## Critical Business Rules
  
  1. **Manual Data Sanctity**: Fields corretora, valor_deposito, performance are
     NEVER overwritten by webhooks, only by manual team updates
  
  2. **Client Identification**: Match clients by documento > email > telefone priority
  
  3. **Multiple Purchases**: valor_produto = SUM of all compras for cliente_id
  
  4. **Appointment Constraint**: Only one active appointment per client enforced at
     application level (no database constraint for flexibility)
*/

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table 1: clientes
CREATE TABLE IF NOT EXISTS clientes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome text NOT NULL,
  email text UNIQUE NOT NULL,
  telefone text NOT NULL,
  documento text UNIQUE,
  data_compra date NOT NULL,
  valor_produto decimal(10,2) DEFAULT 0,
  status text NOT NULL DEFAULT 'comprou' CHECK (status IN ('comprou', 'conta-criada', 'depositou', 'acompanhamento', 'problema')),
  corretora text,
  valor_deposito decimal(10,2),
  performance decimal(5,2),
  pais text,
  pais_iso text,
  moeda text,
  valor_pago_moeda_original decimal(10,2),
  subscriber_code text,
  hotmart_transaction_id text UNIQUE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for clientes
CREATE INDEX IF NOT EXISTS idx_clientes_email ON clientes(email);
CREATE INDEX IF NOT EXISTS idx_clientes_documento ON clientes(documento);
CREATE INDEX IF NOT EXISTS idx_clientes_hotmart_transaction_id ON clientes(hotmart_transaction_id);
CREATE INDEX IF NOT EXISTS idx_clientes_status ON clientes(status);

-- Table 2: ligacoes
CREATE TABLE IF NOT EXISTS ligacoes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  cliente_id uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  user_id uuid,
  data timestamptz DEFAULT now(),
  descricao text NOT NULL,
  status text NOT NULL CHECK (status IN ('positivo', 'atencao', 'problema')),
  created_at timestamptz DEFAULT now()
);

-- Indexes for ligacoes
CREATE INDEX IF NOT EXISTS idx_ligacoes_cliente_id ON ligacoes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ligacoes_data ON ligacoes(data DESC);

-- Table 3: agendamentos
CREATE TABLE IF NOT EXISTS agendamentos (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  cliente_id uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  data date NOT NULL,
  hora time NOT NULL,
  realizado boolean DEFAULT false,
  user_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for agendamentos
CREATE INDEX IF NOT EXISTS idx_agendamentos_cliente_id ON agendamentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_data ON agendamentos(data);
CREATE INDEX IF NOT EXISTS idx_agendamentos_realizado ON agendamentos(realizado);

-- Table 4: compras
CREATE TABLE IF NOT EXISTS compras (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  cliente_id uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  produto_nome text NOT NULL,
  produto_id integer NOT NULL,
  valor decimal(10,2) NOT NULL,
  moeda text NOT NULL,
  hotmart_transaction_id text UNIQUE NOT NULL,
  data_compra date NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Indexes for compras
CREATE INDEX IF NOT EXISTS idx_compras_cliente_id ON compras(cliente_id);
CREATE INDEX IF NOT EXISTS idx_compras_hotmart_transaction_id ON compras(hotmart_transaction_id);

-- Table 5: problemas (for future use)
CREATE TABLE IF NOT EXISTS problemas (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  cliente_id uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  descricao text NOT NULL,
  resolvido boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

-- Index for problemas
CREATE INDEX IF NOT EXISTS idx_problemas_cliente_id ON problemas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_problemas_resolvido ON problemas(resolvido);

-- Enable Row Level Security on all tables
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ligacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE agendamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE problemas ENABLE ROW LEVEL SECURITY;

-- RLS Policies for clientes
CREATE POLICY "Allow all operations for authenticated users on clientes"
  ON clientes
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for ligacoes
CREATE POLICY "Allow all operations for authenticated users on ligacoes"
  ON ligacoes
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for agendamentos
CREATE POLICY "Allow all operations for authenticated users on agendamentos"
  ON agendamentos
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for compras
CREATE POLICY "Allow all operations for authenticated users on compras"
  ON compras
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for problemas
CREATE POLICY "Allow all operations for authenticated users on problemas"
  ON problemas
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for clientes updated_at
DROP TRIGGER IF EXISTS update_clientes_updated_at ON clientes;
CREATE TRIGGER update_clientes_updated_at
  BEFORE UPDATE ON clientes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for agendamentos updated_at
DROP TRIGGER IF EXISTS update_agendamentos_updated_at ON agendamentos;
CREATE TRIGGER update_agendamentos_updated_at
  BEFORE UPDATE ON agendamentos
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();