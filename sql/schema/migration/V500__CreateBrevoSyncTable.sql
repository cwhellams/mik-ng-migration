-- Create table to track Brevo sync state
CREATE TABLE member.brevo_sync_state (
    id SERIAL PRIMARY KEY,
    last_synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    members_synced INTEGER NOT NULL DEFAULT 0,
    sync_status VARCHAR(20) NOT NULL DEFAULT 'SUCCESS',
    -- SUCCESS, FAILED, IN_PROGRESS
    error_message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Insert initial sync state record
INSERT INTO member.brevo_sync_state (last_synced_at, members_synced, sync_status)
VALUES ('1970-01-01 00:00:00', 0, 'SUCCESS');
-- Add Brevo sync tracking columns to member.register
ALTER TABLE member.register
ADD COLUMN brevo_synced_at TIMESTAMP,
    ADD COLUMN brevo_contact_id BIGINT,
    ADD COLUMN brevo_sync_status VARCHAR(20) DEFAULT 'PENDING';
-- PENDING, SYNCED, FAILED
-- Create index on updated_at for efficient querying of changed members
CREATE INDEX idx_member_register_updated_at ON member.register (updated_at);