/*
  # Adicionar campo categoria_investimento à tabela clientes

  1. Alterações
    - Adiciona coluna `categoria_investimento` na tabela `clientes`
      - Tipo: text (opcional)
      - Permite valores NULL para clientes existentes
      - Campo para categorização manual do investidor
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clientes' AND column_name = 'categoria_investimento'
  ) THEN
    ALTER TABLE clientes ADD COLUMN categoria_investimento text;
  END IF;
END $$;