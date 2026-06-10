/*
  # Adicionar coluna Inativos ao Kanban

  ## Descrição
  Adiciona uma nova coluna "Inativos" ao Kanban para leads que já foram contatados
  mas não precisam de agendamento ou acompanhamento no momento.

  ## Alterações
  1. Nova coluna no kanban:
    - status_key: 'inativo'
    - display_name: 'Inativos'
    - ordem: 7 (após Finalizado)

  ## Notas Importantes
  - Clientes com status 'inativo' não aparecerão na aba de Agendamentos
  - Esta coluna é para leads que não precisam de acompanhamento ativo
*/

-- Inserir a nova coluna Inativos no kanban
INSERT INTO kanban_columns (status_key, display_name, ordem) VALUES
  ('inativo', 'Inativos', 7)
ON CONFLICT (status_key) DO NOTHING;