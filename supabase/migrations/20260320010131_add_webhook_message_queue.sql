/*
  # Add Webhook Message Queue and Instance Monitoring

  1. New Tables
    - `whatsapp_message_queue`
      - `id` (uuid, primary key)
      - `instance_name` (text) - Which instance received the message
      - `event_type` (text) - Type of webhook event (messages.upsert, connection.update, etc.)
      - `payload` (jsonb) - Full webhook payload
      - `status` (text) - pending, processed, failed
      - `error_message` (text, nullable) - Error details if processing failed
      - `attempts` (int) - Number of processing attempts
      - `created_at` (timestamptz) - When the webhook was received
      - `processed_at` (timestamptz, nullable) - When it was processed

  2. Changes to whatsapp_instances
    - Add `last_seen` column for connection monitoring
    - Add `disconnected_at` column to track when disconnection was detected
    - Add `alert_sent` column to prevent duplicate alerts

  3. Security
    - Enable RLS on message_queue
    - Queue accessible by authenticated users for their own instance
    - Index for efficient queue processing

  4. Notes
    - Queue provides resilience against message loss
    - last_seen enables proactive disconnect detection
    - Webhook writes to queue first, frontend processes asynchronously
*/

CREATE TABLE IF NOT EXISTS whatsapp_message_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_name text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  attempts int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_message_queue_status ON whatsapp_message_queue(status, created_at);
CREATE INDEX IF NOT EXISTS idx_message_queue_instance ON whatsapp_message_queue(instance_name, status);

ALTER TABLE whatsapp_message_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read queue for their instance"
  ON whatsapp_message_queue
  FOR SELECT
  TO authenticated
  USING (
    instance_name IN (
      SELECT instance_name FROM whatsapp_instances WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update queue for their instance"
  ON whatsapp_message_queue
  FOR UPDATE
  TO authenticated
  USING (
    instance_name IN (
      SELECT instance_name FROM whatsapp_instances WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    instance_name IN (
      SELECT instance_name FROM whatsapp_instances WHERE user_id = auth.uid()
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'whatsapp_instances' AND column_name = 'last_seen'
  ) THEN
    ALTER TABLE whatsapp_instances ADD COLUMN last_seen timestamptz DEFAULT now();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'whatsapp_instances' AND column_name = 'disconnected_at'
  ) THEN
    ALTER TABLE whatsapp_instances ADD COLUMN disconnected_at timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'whatsapp_instances' AND column_name = 'alert_sent'
  ) THEN
    ALTER TABLE whatsapp_instances ADD COLUMN alert_sent boolean DEFAULT false;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_connection_status 
  ON whatsapp_instances(is_connected, last_seen);
