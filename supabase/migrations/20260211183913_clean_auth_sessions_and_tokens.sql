/*
  # Clean all auth sessions and refresh tokens
  
  1. Changes
    - Delete all existing sessions to clear any corrupted data
    - Delete all refresh tokens to clear any corrupted data
  
  2. Rationale
    - The "invalid byte sequence for encoding UTF8" error during login
    - Clearing all sessions forces a fresh start for all users
    - This should resolve the transaction abort issues
*/

-- Delete all sessions
TRUNCATE auth.sessions CASCADE;

-- Delete all refresh tokens  
TRUNCATE auth.refresh_tokens CASCADE;
