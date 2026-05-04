-- Stores pending email change requests.
-- When a member wants to change their email, a verification token is sent
-- to the new address. Only the SHA-256 hash of the token is stored.
-- The actual email update happens only after the token is verified.

CREATE TABLE member.pending_email_changes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id       VARCHAR(9) NOT NULL REFERENCES member.register (member_id) ON DELETE CASCADE,
    new_email       VARCHAR(100) NOT NULL,
    token_hash      TEXT         NOT NULL,
    expires_at      TIMESTAMP    NOT NULL,
    used_at         TIMESTAMP,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast lookups by member_id when invalidating previous requests
CREATE INDEX idx_pending_email_changes_member_id ON member.pending_email_changes (member_id);

-- Unique index on token_hash for fast atomic claim lookups
CREATE UNIQUE INDEX idx_pending_email_changes_token_hash
    ON member.pending_email_changes (token_hash);
