-- Allow master users to read all persistent_chats and persistent_messages
-- for the "View As" feature in WhatsApp

CREATE POLICY "Masters can view all persistent_chats"
  ON persistent_chats
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_master = true
    )
  );

CREATE POLICY "Masters can view all persistent_messages"
  ON persistent_messages
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_master = true
    )
  );
