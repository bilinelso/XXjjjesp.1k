/*
  # Add hidden field to clientes table

  1. Changes
    - Add `oculto` column to `clientes` table
      - Type: boolean
      - Default: false
      - Description: Indicates if the lead/client is hidden from the main view

  2. Notes
    - Hidden leads can be filtered and viewed separately
    - This allows users to declutter their main kanban view without deleting leads
*/

-- Add oculto column to clientes table
ALTER TABLE clientes 
ADD COLUMN IF NOT EXISTS oculto boolean DEFAULT false NOT NULL;