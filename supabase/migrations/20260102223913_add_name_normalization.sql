/*
  # Padronização de Nomes e Textos

  ## Descrição
  Esta migration cria funções e triggers para padronizar automaticamente os nomes
  dos clientes, corrigindo maiúsculas e minúsculas para o formato Title Case
  (Primeira Letra Maiúscula em Cada Palavra).

  ## Mudanças

  1. Funções Criadas
    - `normalize_name()` - Normaliza texto para Title Case, mantendo conectores em minúsculo
    - `trigger_normalize_cliente_name()` - Trigger function para normalização automática

  2. Triggers Criados
    - Trigger em `clientes` para normalizar nomes automaticamente em INSERT/UPDATE

  3. Dados Atualizados
    - Normaliza todos os nomes existentes na tabela `clientes`

  ## Regras de Normalização
  - Primeira letra de cada palavra em maiúscula
  - Resto das letras em minúscula
  - Conectores (de, da, do, dos, das, e) mantidos em minúsculo
  - Preserva acentuação
*/

-- Função para normalizar nomes para Title Case
CREATE OR REPLACE FUNCTION normalize_name(text_input TEXT)
RETURNS TEXT AS $$
DECLARE
  words TEXT[];
  word TEXT;
  result TEXT := '';
  lowercase_words TEXT[] := ARRAY['de', 'da', 'do', 'dos', 'das', 'e'];
BEGIN
  IF text_input IS NULL OR trim(text_input) = '' THEN
    RETURN text_input;
  END IF;

  -- Divide o texto em palavras
  words := string_to_array(lower(trim(text_input)), ' ');
  
  -- Processa cada palavra
  FOREACH word IN ARRAY words
  LOOP
    IF word = '' THEN
      CONTINUE;
    END IF;
    
    -- Se a palavra for um conector comum, mantém em minúsculo
    -- Exceto se for a primeira palavra
    IF result = '' OR NOT (word = ANY(lowercase_words)) THEN
      -- Primeira letra maiúscula, resto minúsculo
      word := upper(substring(word from 1 for 1)) || substring(word from 2);
    END IF;
    
    -- Adiciona ao resultado
    IF result = '' THEN
      result := word;
    ELSE
      result := result || ' ' || word;
    END IF;
  END LOOP;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger function para normalizar nomes automaticamente
CREATE OR REPLACE FUNCTION trigger_normalize_cliente_name()
RETURNS TRIGGER AS $$
BEGIN
  -- Normaliza o nome do cliente
  NEW.nome := normalize_name(NEW.nome);
  
  -- Normaliza outros campos de texto se necessário
  IF NEW.pais IS NOT NULL THEN
    NEW.pais := normalize_name(NEW.pais);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Remove trigger existente se houver
DROP TRIGGER IF EXISTS normalize_cliente_name_trigger ON clientes;

-- Cria trigger para normalização automática
CREATE TRIGGER normalize_cliente_name_trigger
  BEFORE INSERT OR UPDATE ON clientes
  FOR EACH ROW
  EXECUTE FUNCTION trigger_normalize_cliente_name();

-- Atualiza todos os nomes existentes
UPDATE clientes
SET nome = normalize_name(nome)
WHERE nome IS NOT NULL;

-- Atualiza países existentes
UPDATE clientes
SET pais = normalize_name(pais)
WHERE pais IS NOT NULL;

-- Adiciona comentário explicativo
COMMENT ON FUNCTION normalize_name(TEXT) IS 'Normaliza texto para Title Case, mantendo conectores comuns em minúsculo';
COMMENT ON FUNCTION trigger_normalize_cliente_name() IS 'Trigger function que normaliza automaticamente nomes de clientes';
