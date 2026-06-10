CREATE OR REPLACE FUNCTION mark_general_messages_read(
  p_reader_id UUID
) RETURNS void AS $$
  UPDATE internal_messages
  SET read_by = array_append(read_by, p_reader_id)
  WHERE recipient_id IS NULL
    AND sender_id != p_reader_id
    AND NOT (read_by @> ARRAY[p_reader_id]);
$$ LANGUAGE sql SECURITY DEFINER;
