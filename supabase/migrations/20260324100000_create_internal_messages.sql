-- Tabela de mensagens internas entre usuários do CRM
CREATE TABLE IF NOT EXISTS internal_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  read_by UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE internal_messages ENABLE ROW LEVEL SECURITY;

-- Leitura: mensagens gerais (recipient_id IS NULL) ou privadas onde o usuário é parte
CREATE POLICY "internal_messages_select" ON internal_messages
  FOR SELECT USING (
    auth.uid() = sender_id OR
    auth.uid() = recipient_id OR
    recipient_id IS NULL
  );

-- Inserção: somente como o próprio usuário
CREATE POLICY "internal_messages_insert" ON internal_messages
  FOR INSERT WITH CHECK (auth.uid() = sender_id);

-- Update: para marcar como lido (read_by)
CREATE POLICY "internal_messages_update" ON internal_messages
  FOR UPDATE USING (
    auth.uid() = sender_id OR
    auth.uid() = recipient_id OR
    recipient_id IS NULL
  );

CREATE INDEX IF NOT EXISTS idx_internal_messages_sender ON internal_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_internal_messages_recipient ON internal_messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_internal_messages_created ON internal_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_internal_messages_general ON internal_messages(created_at DESC) WHERE recipient_id IS NULL;
