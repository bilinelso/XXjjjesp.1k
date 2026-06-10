/*
  # Adicionar Status Inativo

  ## Descrição
  Adiciona o status 'inativo' à constraint da tabela clientes,
  permitindo mover clientes para a coluna "Inativos" do Kanban.

  ## Mudanças

  1. Constraint Atualizado
    - Remove o CHECK constraint antigo do campo status
    - Adiciona novo CHECK constraint incluindo 'inativo'
    - Valores aceitos agora: comprou, conta-criada, depositou, acompanhamento, problema, finalizado, inativo

  ## Impacto
  - Permite que clientes sejam movidos para o status "inativo"
  - Não afeta dados existentes
  - Totalmente retrocompatível
*/

-- Remove o constraint antigo
ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_status_check;

-- Adiciona o novo constraint com 'inativo' incluído
ALTER TABLE clientes ADD CONSTRAINT clientes_status_check
  CHECK (status IN ('comprou', 'conta-criada', 'depositou', 'acompanhamento', 'problema', 'finalizado', 'inativo'));

-- Atualiza comentário explicativo
COMMENT ON COLUMN clientes.status IS 'Status do cliente no funil: comprou, conta-criada, depositou, acompanhamento, problema, finalizado, inativo';
