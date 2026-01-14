ALTER TABLE member.register
ADD COLUMN simplbooks_synced_at TIMESTAMP,
ADD COLUMN simplbooks_sync_status VARCHAR(20) DEFAULT 'SYNCED';
-- PENDING, SYNCED, FAILED