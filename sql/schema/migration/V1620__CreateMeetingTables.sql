-- ============================================================
-- V1440__CreateMeetingTables
-- ============================================================

CREATE TABLE member.meeting (
    meeting_id              UUID        NOT NULL
        CONSTRAINT pk_member_meeting PRIMARY KEY
        DEFAULT uuidv7(),
    title                   TEXT        NOT NULL,
    description             TEXT,
    document_search_filter  TEXT,
    status                  TEXT        NOT NULL DEFAULT 'DRAFT'
        CONSTRAINT chk_member_meeting_status CHECK (status IN ('DRAFT', 'ONGOING', 'ENDED')),
    created_by              VARCHAR(9)
        REFERENCES member.register (member_id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at              TIMESTAMPTZ,
    ended_at                TIMESTAMPTZ
);

CREATE INDEX ix_member_meeting_status
    ON member.meeting (status);

CREATE TABLE member.meeting_attendance (
    meeting_id UUID        NOT NULL
        REFERENCES member.meeting (meeting_id) ON DELETE CASCADE,
    member_id  VARCHAR(9)  NOT NULL
        REFERENCES member.register (member_id),
    joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_member_meeting_attendance PRIMARY KEY (meeting_id, member_id)
);

CREATE INDEX ix_member_meeting_attendance_member_id
    ON member.meeting_attendance (member_id);

CREATE TABLE member.meeting_vote_counter (
    meeting_id   UUID        NOT NULL
        REFERENCES member.meeting (meeting_id) ON DELETE CASCADE,
    member_id    VARCHAR(9)  NOT NULL
        REFERENCES member.register (member_id),
    assigned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    assigned_by  VARCHAR(9)
        REFERENCES member.register (member_id),

    CONSTRAINT pk_member_meeting_vote_counter PRIMARY KEY (meeting_id, member_id)
);

CREATE INDEX ix_member_meeting_vote_counter_member_id
    ON member.meeting_vote_counter (member_id);

CREATE TABLE member.meeting_vote (
    vote_id           UUID        NOT NULL
        CONSTRAINT pk_member_meeting_vote PRIMARY KEY
        DEFAULT uuidv7(),
    meeting_id        UUID        NOT NULL
        REFERENCES member.meeting (meeting_id) ON DELETE CASCADE,
    topic             TEXT        NOT NULL,
    description       TEXT,
    is_multi_select   BOOLEAN     NOT NULL DEFAULT FALSE,
    max_selections    INT,
    status            TEXT        NOT NULL DEFAULT 'DRAFT'
        CONSTRAINT chk_member_meeting_vote_status CHECK (status IN ('DRAFT', 'OPEN', 'CLOSED')),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by        VARCHAR(9)
        REFERENCES member.register (member_id),
    closed_at         TIMESTAMPTZ,
    closed_by         VARCHAR(9)
        REFERENCES member.register (member_id),
    display_order     INT         NOT NULL DEFAULT 0,

    CONSTRAINT chk_member_meeting_vote_max_selections CHECK (max_selections IS NULL OR max_selections > 0),
    CONSTRAINT chk_member_meeting_vote_single_select_max CHECK (is_multi_select OR max_selections IS NULL)
);

CREATE INDEX ix_member_meeting_vote_meeting_id
    ON member.meeting_vote (meeting_id, display_order);

CREATE TABLE member.vote_option (
    option_id      UUID        NOT NULL
        CONSTRAINT pk_member_vote_option PRIMARY KEY
        DEFAULT uuidv7(),
    vote_id        UUID        NOT NULL
        REFERENCES member.meeting_vote (vote_id) ON DELETE CASCADE,
    option_text    TEXT        NOT NULL,
    display_order  INT         NOT NULL DEFAULT 0,

    CONSTRAINT uq_member_vote_option_vote_option UNIQUE (vote_id, option_id)
);

CREATE INDEX ix_member_vote_option_vote_id
    ON member.vote_option (vote_id, display_order);

CREATE TABLE member.vote_cast (
    cast_id    UUID        NOT NULL
        CONSTRAINT pk_member_vote_cast PRIMARY KEY
        DEFAULT uuidv7(),
    vote_id    UUID        NOT NULL
        REFERENCES member.meeting_vote (vote_id) ON DELETE CASCADE,
    member_id  VARCHAR(9)  NOT NULL
        REFERENCES member.register (member_id),
    cast_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_member_vote_cast_vote_member UNIQUE (vote_id, member_id)
);

CREATE INDEX ix_member_vote_cast_vote_id
    ON member.vote_cast (vote_id);

CREATE INDEX ix_member_vote_cast_member_id
    ON member.vote_cast (member_id);

CREATE TABLE member.vote_selection (
    selection_id UUID        NOT NULL
        CONSTRAINT pk_member_vote_selection PRIMARY KEY
        DEFAULT uuidv7(),
    vote_id      UUID        NOT NULL
        REFERENCES member.meeting_vote (vote_id) ON DELETE CASCADE,
    option_id    UUID        NOT NULL,
    selected_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_member_vote_selection_vote_option
        FOREIGN KEY (vote_id, option_id)
        REFERENCES member.vote_option (vote_id, option_id)
        ON DELETE CASCADE
);

CREATE INDEX ix_member_vote_selection_vote_option
    ON member.vote_selection (vote_id, option_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE member.meeting TO ${app_db_user};
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE member.meeting_attendance TO ${app_db_user};
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE member.meeting_vote_counter TO ${app_db_user};
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE member.meeting_vote TO ${app_db_user};
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE member.vote_option TO ${app_db_user};
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE member.vote_cast TO ${app_db_user};
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE member.vote_selection TO ${app_db_user};

UPDATE member.roles
SET permissions = COALESCE(permissions, '[]'::jsonb) || '["meeting.admin"]'::jsonb,
    updated_at = NOW(),
    updated_by = 'k1mnimda'
WHERE role_id = 'ADMIN'
  AND (permissions IS NULL OR NOT (permissions @> '["meeting.admin"]'::jsonb));

UPDATE member.roles
SET permissions = COALESCE(permissions, '[]'::jsonb) || '["meeting.user"]'::jsonb,
    updated_at = NOW(),
    updated_by = 'k1mnimda'
WHERE role_id IN ('MEMBER', 'FLYING_MEMBER')
  AND (permissions IS NULL OR NOT (permissions @> '["meeting.user"]'::jsonb));
