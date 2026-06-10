/*
  # Add participant tracking for group messages

  1. Changes
    - Add `participant_jid` column to `persistent_messages` table to track individual senders in group chats
    - Add `participant_name` column to store the push name of the participant
    - Create index for efficient querying by participant

  2. Purpose
    - Enable tracking of individual message senders in group conversations
    - Store sender's JID (WhatsApp ID) and display name for group message attribution
*/

-- Add participant columns to persistent_messages
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'persistent_messages' AND column_name = 'participant_jid'
  ) THEN
    ALTER TABLE persistent_messages ADD COLUMN participant_jid text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'persistent_messages' AND column_name = 'participant_name'
  ) THEN
    ALTER TABLE persistent_messages ADD COLUMN participant_name text;
  END IF;
END $$;

-- Create index for efficient participant queries
CREATE INDEX IF NOT EXISTS idx_persistent_messages_participant 
  ON persistent_messages(participant_jid) 
  WHERE participant_jid IS NOT NULL;