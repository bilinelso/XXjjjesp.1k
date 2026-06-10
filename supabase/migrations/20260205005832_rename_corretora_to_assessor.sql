/*
  # Renomear coluna 'corretora' para 'assessor'

  1. Alterações
    - Renomeia a coluna `corretora` para `assessor` na tabela `clientes`
    - Mantém todos os dados existentes intactos
  
  2. Notas
    - Agora todos os clientes pertencem à mesma corretora
    - O campo identifica qual assessor está responsável pelo cliente
    - Nenhuma alteração em RLS ou permissões necessária
*/

-- Renomear coluna corretora para assessor
ALTER TABLE clientes RENAME COLUMN corretora TO assessor;
