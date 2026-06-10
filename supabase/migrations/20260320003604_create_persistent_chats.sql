/*
  # Persistent WhatsApp Chats

  1. New Tables
    - `persistent_chats` - Stores chat metadata that persists across WhatsApp instance changes
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to users)
      - `contact_phone` (text) - normalized phone number of the contact
      - `contact_name` (text) - display name of the contact
      - `contact_jid` (text) - last known JID (can change between instances)
      - `is_group` (boolean) - whether this is a group chat
      - `last_message_text` (text) - preview of last message
      - `last_message_timestamp` (timestamptz) - when last message was sent/received
      - `last_message_from_me` (boolean) - if last message was sent by user
      - `unread_count` (integer) - number of unread messages
      - `is_active` (boolean) - if chat should be shown (not archived)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

    - `persistent_messages` - Stores messages that persist across instance changes
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to users)
      - `chat_id` (uuid, foreign key to persistent_chats)
      - `message_id` (text) - original WhatsApp message ID
      - `from_me` (boolean) - if message was sent by user
      - `message_text` (text) - message content
      - `message_type` (text) - type of message (text, image, audio, etc)
      - `timestamp` (timestamptz) - when message was sent
      - `instance_name` (text) - which instance sent/received this message
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on both tables
    - Users can only access their own chats and messages
*/

-- Persistent chats table
CREATE TABLE IF NOT EXISTS persistent_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_phone text NOT NULL,
  contact_name text NOT NULL DEFAULT '',
  contact_jid text,
  is_group boolean DEFAULT false,
  last_message_text text DEFAULT '',
  last_message_timestamp timestamptz,
  last_message_from_me boolean DEFAULT false,
  unread_count integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, contact_phone)
);

CREATE INDEX idx_persistent_chats_user_id ON persistent_chats(user_id);
CREATE INDEX idx_persistent_chats_user_active ON persistent_chats(user_id, is_active);
CREATE INDEX idx_persistent_chats_contact_phone ON persistent_chats(user_id, contact_phone);

ALTER TABLE persistent_chats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own persistent chats"
  ON persistent_chats FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own persistent chats"
  ON persistent_chats FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own persistent chats"
  ON persistent_chats FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own persistent chats"
  ON persistent_chats FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Persistent messages table
CREATE TABLE IF NOT EXISTS persistent_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id uuid NOT NULL REFERENCES persistent_chats(id) ON DELETE CASCADE,
  message_id text,
  from_me boolean DEFAULT false,
  message_text text NOT NULL DEFAULT '',
  message_type text DEFAULT 'text',
  timestamp timestamptz NOT NULL DEFAULT now(),
  instance_name text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_persistent_messages_chat_id ON persistent_messages(chat_id);
CREATE INDEX idx_persistent_messages_user_id ON persistent_messages(user_id);
CREATE INDEX idx_persistent_messages_timestamp ON persistent_messages(chat_id, timestamp DESC);

ALTER TABLE persistent_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own persistent messages"
  ON persistent_messages FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own persistent messages"
  ON persistent_messages FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own persistent messages"
  ON persistent_messages FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own persistent messages"
  ON persistent_messages FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
