/*
  # Add Assessor Association to User Profiles

  1. Changes
    - Adds `assessor_id` column to `user_profiles` table
    - Creates foreign key relationship to `assessores` table
    - Allows linking a user account to a specific assessor
  
  2. Purpose
    - Non-master users will only see agendamentos for clients assigned to their assessor
    - Master users continue to see all agendamentos
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'assessor_id'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN assessor_id uuid REFERENCES assessores(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_profiles_assessor_id ON user_profiles(assessor_id);