/*
  # Adicionar Status Finalizado

  ## Descrição
  Esta migration adiciona o novo status 'finalizado' à tabela clientes,
  permitindo marcar clientes que completaram todo o processo.

  ## Mudanças

  1. Constraint Atualizado
    - Remove o CHECK constraint antigo do campo status
    - Adiciona novo CHECK constraint incluindo 'finalizado'
    - Valores aceitos agora: comprou, conta-criada, depositou, acompanhamento, problema, finalizado

  ## Impacto
  - Permite que clientes sejam movidos para o status "Finalizado"
  - Não afeta dados existentes
  - Totalmente retrocompatível
*/

-- Remove o constraint antigo
ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_status_check;

-- Adiciona o novo constraint com 'finalizado' incluído
ALTER TABLE clientes ADD CONSTRAINT clientes_status_check 
  CHECK (status IN ('comprou', 'conta-criada', 'depositou', 'acompanhamento', 'problema', 'finalizado'));

-- Adiciona comentário explicativo
COMMENT ON COLUMN clientes.status IS 'Status do cliente no funil: comprou, conta-criada, depositou, acompanhamento, problema, finalizado';
