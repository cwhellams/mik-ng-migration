-- ============================================================
-- V1160 – Create club events table
-- ============================================================
-- Foundation for the events/agenda feature (issue: Agenda style calendar):
--   * Admins can add events with name, description, start/end time,
--     location, and a public flag.
--   * Public events are exposed via a public API endpoint.
--   * Members see all events in an agenda view.
-- ============================================================

CREATE TABLE member.events (
    event_id   UUID        NOT NULL
        CONSTRAINT pk_member_events PRIMARY KEY
        DEFAULT uuidv7(),

    title      TEXT        NOT NULL,
    description TEXT,
    location   TEXT,

    start_time TIMESTAMPTZ NOT NULL,
    end_time   TIMESTAMPTZ NOT NULL,

    is_public  BOOLEAN     NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by VARCHAR(9)  NOT NULL
        REFERENCES member.register (member_id),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by VARCHAR(9)  NOT NULL
        REFERENCES member.register (member_id),

    CONSTRAINT chk_member_events_end_after_start
        CHECK (end_time > start_time)
);

CREATE INDEX ix_member_events_start_time
    ON member.events (start_time);

CREATE INDEX ix_member_events_public
    ON member.events (is_public)
    WHERE is_public = TRUE;

-- ----------------------------------------------------------------
-- Permissions
-- ----------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON member.events TO ${app_db_user};

-- Add events.admin permission to ADMIN role
UPDATE member.roles
SET permissions = COALESCE(permissions, '[]'::jsonb) || '["events.admin"]'::jsonb,
    updated_at  = NOW(),
    updated_by  = 'k1mnimda'
WHERE role_id = 'ADMIN'
  AND (permissions IS NULL OR NOT (permissions @> '["events.admin"]'::jsonb));
