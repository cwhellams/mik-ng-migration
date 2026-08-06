-- Create table to track Brevo newsletter campaign archive sync state.
-- Intentionally starts empty (no seed row): the worker creates the first
-- state row on its first run using the current time as the cursor, so that
-- only campaigns sent after the feature is enabled get archived (no backfill).
CREATE TABLE member.brevo_campaign_archive_state (
    id SERIAL PRIMARY KEY,
    last_synced_at TIMESTAMP NOT NULL,
    campaigns_archived INTEGER NOT NULL DEFAULT 0,
    sync_status VARCHAR(20) NOT NULL,
    -- SUCCESS, FAILED, IN_PROGRESS
    error_message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
