/*
  # Add unique constraint on persistent_chats(user_id, contact_phone)

  Required for upsert with onConflict in process-broadcast Edge Function.

  1. Deduplicates existing rows keeping the most recent active chat per (user_id, contact_phone)
  2. Adds UNIQUE constraint
*/

-- Step 1: remove duplicates, keeping the row with the most recent last_message_timestamp
-- (or the smallest id as tiebreaker) for each (user_id, contact_phone) pair
DELETE FROM persistent_chats
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY user_id, contact_phone
        ORDER BY
          last_message_timestamp DESC NULLS LAST,
          id ASC
      ) AS rn
    FROM persistent_chats
    WHERE contact_phone IS NOT NULL
  ) ranked
  WHERE rn > 1
);

-- Step 2: add the unique constraint
ALTER TABLE persistent_chats
ADD CONSTRAINT unique_user_contact_phone
UNIQUE (user_id, contact_phone);
