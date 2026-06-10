/*
  # Add Multi-Instance Support for WhatsApp
  
  1. Changes
    - Add `is_active` field to `whatsapp_instances` to track which instance is currently in use
    - Remove unique constraint on `user_id` to allow multiple instances per user
    - Add unique constraint on (user_id, instance_name) to prevent duplicates
    - Add helper function to get active instance for a user
    
  2. Why
    - Supports multiple WhatsApp numbers per user
    - Each number has its own Evolution API instance
    - Only one instance is active at a time
    - Message history is preserved across instance switches via contact_jid
    
  3. Security
    - RLS policies remain unchanged
    - Users can only manage their own instances
*/

-- Add is_active field to whatsapp_instances
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'whatsapp_instances' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE whatsapp_instances ADD COLUMN is_active boolean DEFAULT false;
  END IF;
END $$;

-- Remove the unique constraint on user_id if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'whatsapp_instances_user_id_unique'
  ) THEN
    ALTER TABLE whatsapp_instances DROP CONSTRAINT whatsapp_instances_user_id_unique;
  END IF;
END $$;

-- Ensure unique constraint on (user_id, instance_name)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'whatsapp_instances_user_id_instance_name_unique'
  ) THEN
    ALTER TABLE whatsapp_instances
      ADD CONSTRAINT whatsapp_instances_user_id_instance_name_unique
      UNIQUE (user_id, instance_name);
  END IF;
END $$;

-- Set the first instance as active for each user if they don't have an active one
UPDATE whatsapp_instances
SET is_active = true
WHERE id IN (
  SELECT DISTINCT ON (user_id) id
  FROM whatsapp_instances
  WHERE NOT EXISTS (
    SELECT 1 FROM whatsapp_instances wi2
    WHERE wi2.user_id = whatsapp_instances.user_id
    AND wi2.is_active = true
  )
  ORDER BY user_id, created_at ASC
);

-- Create function to get active instance for a user
CREATE OR REPLACE FUNCTION get_active_instance(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  instance_name text,
  phone_number text,
  is_connected boolean,
  is_active boolean
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    wi.id,
    wi.user_id,
    wi.instance_name,
    wi.phone_number,
    wi.is_connected,
    wi.is_active
  FROM whatsapp_instances wi
  WHERE wi.user_id = p_user_id
    AND wi.is_active = true
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to ensure only one active instance per user
CREATE OR REPLACE FUNCTION ensure_single_active_instance()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_active = true THEN
    -- Set all other instances for this user to inactive
    UPDATE whatsapp_instances
    SET is_active = false
    WHERE user_id = NEW.user_id
      AND id != NEW.id
      AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_ensure_single_active_instance ON whatsapp_instances;
CREATE TRIGGER trigger_ensure_single_active_instance
  BEFORE INSERT OR UPDATE ON whatsapp_instances
  FOR EACH ROW
  WHEN (NEW.is_active = true)
  EXECUTE FUNCTION ensure_single_active_instance();
