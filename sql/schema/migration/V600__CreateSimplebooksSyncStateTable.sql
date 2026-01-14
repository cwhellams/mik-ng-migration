-- Create table to track Simplbooks sync state
CREATE TABLE member.simplbooks_sync_state (
    id SERIAL PRIMARY KEY,
    last_synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    members_synced INTEGER NOT NULL DEFAULT 0,
    sync_status VARCHAR(20) NOT NULL DEFAULT 'SUCCESS',
    -- SUCCESS, FAILED, IN_PROGRESS
    error_message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Insert initial sync state record
INSERT INTO member.simplbooks_sync_state (last_synced_at, members_synced, sync_status)
VALUES ('1970-01-01 00:00:00', 0, 'SUCCESS');