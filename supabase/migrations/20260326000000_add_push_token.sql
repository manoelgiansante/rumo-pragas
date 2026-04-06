-- Add push_token column for storing Expo push notification tokens
ALTER TABLE pragas_profiles ADD COLUMN IF NOT EXISTS push_token TEXT;

-- Add deletion_requested_at column for LGPD account deletion requests
ALTER TABLE pragas_profiles ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ;
