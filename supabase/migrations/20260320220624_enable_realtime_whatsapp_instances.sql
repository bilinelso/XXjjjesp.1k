/*
  # Enable Realtime for WhatsApp Instances
  
  1. Changes
    - Enable realtime replication for `whatsapp_instances` table
    
  2. Why
    - Allows frontend to receive real-time updates when connection status changes via webhook
    - Essential for displaying accurate "Conectado" / "Desconectado" status in UI
    - The evolution-webhook already updates is_connected when receiving connection.update events
    
  3. Security
    - RLS policies already in place remain active
    - Realtime respects existing SELECT policies for authenticated users
*/

-- Enable realtime for whatsapp_instances
ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_instances;
