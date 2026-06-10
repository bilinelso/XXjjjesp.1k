/*
  # Permitir valores nulos em data e hora dos agendamentos

  1. Changes
    - Altera a coluna `data` para aceitar valores NULL
    - Altera a coluna `hora` para aceitar valores NULL
    
  2. Reason
    - Permite flexibilidade ao gerenciar agendamentos
    - Necessário para funcionalidade de conclusão de agendamentos
*/

-- Permitir NULL na coluna data (se ainda não foi feito)
DO $$
BEGIN
  ALTER TABLE agendamentos ALTER COLUMN data DROP NOT NULL;
EXCEPTION
  WHEN others THEN NULL;
END $$;

-- Permitir NULL na coluna hora
DO $$
BEGIN
  ALTER TABLE agendamentos ALTER COLUMN hora DROP NOT NULL;
EXCEPTION
  WHEN others THEN NULL;
END $$;