/*
  # Adicionar rastreamento de envio de GCLID aos clientes

  ## Descrição
  Adiciona campos para rastrear quando uma conversão GCLID foi enviada ao Google Ads
  através da planilha do Google Sheets.

  ## Alterações
  1. Novos campos na tabela clientes:
    - `gclid_enviado` (boolean): Indica se a conversão GCLID já foi enviada
    - `gclid_enviado_em` (timestamptz): Data e hora do envio da conversão

  ## Notas
  - Similar aos campos postback_enviado e postback_enviado_em
  - Usado para evitar envios duplicados de conversões
*/

-- Adicionar campos de rastreamento de GCLID
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clientes' AND column_name = 'gclid_enviado'
  ) THEN
    ALTER TABLE clientes ADD COLUMN gclid_enviado boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clientes' AND column_name = 'gclid_enviado_em'
  ) THEN
    ALTER TABLE clientes ADD COLUMN gclid_enviado_em timestamptz;
  END IF;
END $$;