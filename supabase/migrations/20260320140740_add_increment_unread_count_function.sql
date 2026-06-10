/*
  # Add atomic unread count increment function

  Creates a SQL function to atomically increment the unread_count
  on persistent_chats, avoiding race conditions from read-then-write patterns.

  1. New Functions
    - `increment_chat_unread_count(chat_id uuid)` - atomically increments unread_count by 1
*/

CREATE OR REPLACE FUNCTION increment_chat_unread_count(p_chat_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE persistent_chats
  SET unread_count = unread_count + 1,
      updated_at = now()
  WHERE id = p_chat_id;
$$;
