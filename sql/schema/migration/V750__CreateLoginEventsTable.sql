-- Audit log for all authentication events.
-- Only member_id is foreign-keyed; failed login events (user not found)
-- should be recorded with a NULL member_id.

CREATE TYPE auth_event_type AS ENUM (
    'login_success',
    'login_failed',
    'login_code_invalid',
    'login_code_expired',
    'login_code_max_attempts',
    'logout',
    'token_refresh',
    'registration_verified'
);

CREATE TABLE member.login_events (
    id          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id   VARCHAR(9)      REFERENCES member.register (member_id) ON DELETE SET NULL,
    event_type  auth_event_type NOT NULL,
    ip_address  VARCHAR(45),
    user_agent  TEXT,
    created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Queries are almost always "all events for a member"
CREATE INDEX idx_login_events_member_id ON member.login_events (member_id);
CREATE INDEX idx_login_events_created_at ON member.login_events (created_at);

