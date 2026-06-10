CREATE OR REPLACE FUNCTION mark_internal_messages_read(
  p_sender_id UUID,
  p_recipient_id UUID
) RETURNS void AS $$
  UPDATE internal_messages
  SET read_by = array_append(read_by, p_recipient_id)
  WHERE sender_id = p_sender_id
    AND recipient_id = p_recipient_id
    AND NOT (read_by @> ARRAY[p_recipient_id]);
$$ LANGUAGE sql SECURITY DEFINER;
