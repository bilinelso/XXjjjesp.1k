/*
  # Improve Chat Deduplication and Contact Resolution

  1. New Function
    - Create function to merge duplicate chats intelligently
    - Handles cases where chats have same phone but different names
    - Consolidates messages from both chats
    - Preserves most recent data

  2. New Index
    - Add index on (user_id, contact_phone) for faster duplicate detection
    - Add index on contact_name for name-based deduplication

  3. Deduplication Logic
    - Prioritize chats with actual contact names (not phone numbers)
    - Keep chat with most recent message
    - Consolidate all messages into primary chat
    - Update foreign key references
    - Disable/cleanup secondary chat

  4. Notes
    - This function can be called manually or from application layer
    - Should be executed before displaying chat list to users
    - Returns count of chats merged
*/

-- Create function to handle chat deduplication
CREATE OR REPLACE FUNCTION deduplicate_chats_for_user(user_id_param uuid)
RETURNS TABLE(merged_count int, consolidated_chats int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_merged_count int := 0;
  v_consolidated_count int := 0;
  v_duplicate_group record;
  v_primary_chat_id uuid;
  v_secondary_chat_id uuid;
  v_total_unread int;
BEGIN
  FOR v_duplicate_group IN
    SELECT
      contact_phone,
      array_agg(id ORDER BY 
        CASE WHEN contact_name ~ '^[0-9]+$' THEN 1 ELSE 0 END,
        last_message_timestamp DESC NULLS LAST
      ) as chat_ids,
      count(*) as chat_count
    FROM persistent_chats
    WHERE user_id = user_id_param AND is_active = true
    GROUP BY contact_phone
    HAVING count(*) > 1
  LOOP
    v_primary_chat_id := (v_duplicate_group.chat_ids)[1];
    
    FOR i IN 2 .. array_length(v_duplicate_group.chat_ids, 1)
    LOOP
      v_secondary_chat_id := (v_duplicate_group.chat_ids)[i];
      
      SELECT COALESCE(SUM(unread_count), 0) INTO v_total_unread
      FROM persistent_chats
      WHERE id IN (v_primary_chat_id, v_secondary_chat_id);
      
      UPDATE persistent_messages
      SET chat_id = v_primary_chat_id
      WHERE chat_id = v_secondary_chat_id;
      
      UPDATE persistent_chats
      SET 
        unread_count = v_total_unread,
        last_message_timestamp = GREATEST(
          (SELECT last_message_timestamp FROM persistent_chats WHERE id = v_primary_chat_id),
          (SELECT last_message_timestamp FROM persistent_chats WHERE id = v_secondary_chat_id)
        ),
        updated_at = now()
      WHERE id = v_primary_chat_id;
      
      UPDATE persistent_chats
      SET is_active = false
      WHERE id = v_secondary_chat_id;
      
      v_merged_count := v_merged_count + 1;
    END LOOP;
    
    v_consolidated_count := v_consolidated_count + 1;
  END LOOP;
  
  RETURN QUERY SELECT v_merged_count, v_consolidated_count;
END;
$$;

-- Improve indexes for chat lookup
CREATE INDEX IF NOT EXISTS idx_persistent_chats_user_phone 
ON persistent_chats(user_id, contact_phone) 
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_persistent_chats_contact_name 
ON persistent_chats(user_id, contact_name) 
WHERE is_active = true;

-- Create trigger to auto-deduplicate on new chat insertion
CREATE OR REPLACE FUNCTION check_duplicate_chats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_count int;
BEGIN
  SELECT count(*) INTO v_existing_count
  FROM persistent_chats
  WHERE user_id = NEW.user_id
    AND contact_phone = NEW.contact_phone
    AND id != NEW.id
    AND is_active = true;
  
  IF v_existing_count > 0 THEN
    UPDATE persistent_chats
    SET is_active = false
    WHERE user_id = NEW.user_id
      AND contact_phone = NEW.contact_phone
      AND id != NEW.id
      AND is_active = true
      AND (contact_name ~ '^[0-9]+$' OR contact_name = '');
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_duplicate_chats_trigger ON persistent_chats;

CREATE TRIGGER check_duplicate_chats_trigger
AFTER INSERT ON persistent_chats
FOR EACH ROW
EXECUTE FUNCTION check_duplicate_chats();
