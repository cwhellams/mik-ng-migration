-- Server-side session registry (#1234).
--
-- Authentication here is otherwise fully stateless: a 15-minute access JWT and a
-- 365-day refresh JWT, both httpOnly cookies, verified in memory with no database
-- hit. member.login_events is a write-only audit log with no read path and no way
-- to express "is this still active", so it cannot answer "which devices am I
-- signed in on" and cannot be revoked against. This table is the missing half.
--
-- One row per sign-in. Its id is carried as the refresh token's `jti` claim (and
-- as the access token's `sid`), so revocation needs no token hash stored here --
-- nothing in this table is secret, and a leaked row grants nothing.
--
-- Revocation is deliberately bounded rather than instant: it is enforced when a
-- refresh token is exchanged, not on every authenticated request, so the
-- per-request hot path keeps its zero database queries. A terminated session
-- therefore keeps working elsewhere until its current access token expires -- up
-- to 15 minutes. The UI says so in as many words.
CREATE TABLE member.sessions (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

    -- ON DELETE CASCADE, unlike login_events' SET NULL: a session row with no
    -- member is meaningless. This table only ever answers "what is active for
    -- member X"; it is not a standalone audit trail (login_events is).
    member_id       VARCHAR(9)    NOT NULL REFERENCES member.register (member_id) ON DELETE CASCADE,

    -- Where the sign-in came from. Fixed at creation and never overwritten on
    -- refresh: "where this login started" is a stabler signal for spotting a
    -- session you do not recognise than a value that drifts as someone roams
    -- between networks. 45 chars fits an IPv4-mapped IPv6 address.
    ip_address      VARCHAR(45),
    user_agent      TEXT,

    created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Soft delete, mirroring the audit spirit of login_events: a revoked row
    -- records that the session existed and why it ended.
    revoked_at      TIMESTAMP,
    revoked_reason  VARCHAR(30)
);

COMMENT ON COLUMN member.sessions.revoked_reason IS
  'logout | user_terminated | admin_terminated | bulk_logout_others';

-- "All sessions for a member", for the admin view and for revoke-others.
CREATE INDEX idx_sessions_member_id ON member.sessions (member_id);

-- The list the sessions card renders, and the lookup /refresh does on every
-- token exchange, both filter on revoked_at IS NULL.
CREATE INDEX idx_sessions_member_active ON member.sessions (member_id) WHERE revoked_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON member.sessions TO ${app_db_user};

-- Terminating a session and bulk-revoking the others are login-related events,
-- so they belong in the same audit log as every other one. ADD VALUE IF NOT
-- EXISTS has precedent in this migration set (V950__CreatePasskeysTable.sql:88).
ALTER TYPE auth_event_type ADD VALUE IF NOT EXISTS 'session_terminated';
ALTER TYPE auth_event_type ADD VALUE IF NOT EXISTS 'sessions_bulk_revoked';
