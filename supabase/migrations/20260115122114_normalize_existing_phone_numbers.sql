/*
  # Normalize existing phone numbers in clientes table

  1. Changes
    - Updates all phone numbers in the `clientes` table to the standardized format `+55xxxxxxxxxx`
    - Handles phones that already start with '55' by adding only '+'
    - Handles phones without country code by adding '+55'
    - Preserves NULL values

  2. Purpose
    - Ensures all existing phone numbers follow the same format as new entries
    - Fixes matching between `leads` and `clientes` tables based on phone numbers
*/

-- Update phone numbers that don't start with '+' but start with '55'
UPDATE clientes
SET telefone = '+' || regexp_replace(telefone, '[^0-9]', '', 'g')
WHERE telefone IS NOT NULL 
  AND telefone != ''
  AND telefone NOT LIKE '+%'
  AND regexp_replace(telefone, '[^0-9]', '', 'g') LIKE '55%';

-- Update phone numbers that don't start with '+' and don't start with '55'
UPDATE clientes
SET telefone = '+55' || regexp_replace(telefone, '[^0-9]', '', 'g')
WHERE telefone IS NOT NULL 
  AND telefone != ''
  AND telefone NOT LIKE '+%'
  AND regexp_replace(telefone, '[^0-9]', '', 'g') NOT LIKE '55%';
