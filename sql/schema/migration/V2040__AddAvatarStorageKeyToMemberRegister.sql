-- Add avatar storage key to member.register for uploaded member avatars.
-- Only the storage key is persisted; the URL is a short-lived presigned URL computed
-- at read time against a Restricted DO Space (member-avatars bucket), not a public URL,
-- since a member's photo is personal data. member.register already has a table-level
-- GRANT SELECT, INSERT, UPDATE, DELETE for ${app_db_user} (V480), so no extra grant is
-- needed for this column.

ALTER TABLE member.register
    ADD COLUMN avatar_storage_key VARCHAR(500);

COMMENT ON COLUMN member.register.avatar_storage_key IS 'Storage key (path) for an uploaded member avatar in the restricted member-avatars DO Space; the URL is presigned on read, not stored.';
