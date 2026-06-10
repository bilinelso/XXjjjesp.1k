/*
  # Enable Realtime for WhatsApp Tables

  1. Changes
    - Enable realtime replication for `persistent_chats` table
    - Enable realtime replication for `persistent_messages` table
    
  2. Why
    - Allows frontend to receive real-time updates when messages arrive via webhook
    - Essential for instant message display in WhatsApp interface
    
  3. Security
    - RLS policies already in place remain active
    - Realtime respects existing SELECT policies for authenticated users
*/

-- Enable realtime for persistent_chats
ALTER PUBLICATION supabase_realtime ADD TABLE persistent_chats;

-- Enable realtime for persistent_messages
ALTER PUBLICATION supabase_realtime ADD TABLE persistent_messages;
