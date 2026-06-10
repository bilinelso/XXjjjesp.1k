/*
  # Add Unique Constraint to Persistent Messages

  1. Changes
    - Add unique constraint on (chat_id, message_id) to prevent duplicate messages
    - This enables proper upsert behavior via webhook
    - Prevents the same message from being inserted multiple times

  2. Notes
    - Uses IF NOT EXISTS pattern for safety
    - Handles cases where message_id could be null (for manually sent messages)
*/

CREATE UNIQUE INDEX IF NOT EXISTS idx_persistent_messages_unique_message
  ON persistent_messages(chat_id, message_id)
  WHERE message_id IS NOT NULL;
