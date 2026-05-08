-- ============================================================
-- V990 – Create DTO (Declared Training Organisation) schema
-- ============================================================
-- Foundation tables for MVP DTO features (issue #569):
--   * Versioned syllabus management (Draft / Published)
--   * Member <-> syllabus assignment (one active per member)
--   * Flight attempt tracking (supports re-flights when student
--     does not pass or one flight is not enough)
--   * Instructor verification workflow (item outcomes, remarks)
--   * Hold Item List (HIL) queue (per stakeholder decision: separate table)
--
-- Scope: schema only. No business logic, endpoints, or UI.
-- ============================================================

-- ----------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------
CREATE TYPE dto.syllabus_status AS ENUM ('DRAFT', 'WAITING_FOR_APPROVAL', 'PUBLISHED', 'ARCHIVED');

-- Outcome of a single item on a verified flight.
-- MOVED_TO_HIL means the item was deferred to the Hold Item List.
CREATE TYPE dto.item_outcome AS ENUM ('COMPLETED', 'FAILED', 'MOVED_TO_HIL');

-- Result of an instructor's verification of a DTO flight.
CREATE TYPE dto.verification_result AS ENUM ('APPROVED', 'FAILED');


CREATE TABLE dto.training_program
(
    program_id UUID NOT NULL
        CONSTRAINT pk_dto_training_program
        PRIMARY KEY
        DEFAULT uuidv7(),

    name TEXT NOT NULL,
    description TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by VARCHAR(9) NOT NULL
        REFERENCES member.register (member_id),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by VARCHAR(9) NOT NULL
        REFERENCES member.register (member_id),

    CONSTRAINT uq_dto_training_program_name
        UNIQUE (name)
);

CREATE TABLE dto.syllabus (
    syllabus_id UUID NOT NULL
    CONSTRAINT pk_dto_syllabus
        PRIMARY KEY
    DEFAULT uuidv7(),

    program_id UUID NOT NULL
    REFERENCES dto.training_program (program_id),

    major_version INTEGER NOT NULL,
    minor_version INTEGER NOT NULL,
    patch_version INTEGER NOT NULL DEFAULT 0,

    version TEXT GENERATED ALWAYS AS
(
        major_version || '.' ||
        minor_version || '.' ||
        patch_version
    ) STORED,

    description TEXT,

    status dto.syllabus_status
        NOT NULL
        DEFAULT 'DRAFT',

    published_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ
        NOT NULL
        DEFAULT now
(),

    created_by VARCHAR
(9)
        NOT NULL
        REFERENCES member.register
(member_id),

    updated_at TIMESTAMPTZ
        NOT NULL
        DEFAULT now
(),

    updated_by VARCHAR
(9)
        NOT NULL
        REFERENCES member.register
(member_id),

    CONSTRAINT uq_dto_syllabus_program_version
        UNIQUE
(
            program_id,
            major_version,
            minor_version,
            patch_version
        ),

    CONSTRAINT chk_dto_syllabus_version_positive
        CHECK
(
            major_version >= 0
            AND minor_version >= 0
            AND patch_version >= 0
        ),

    CONSTRAINT chk_dto_syllabus_published_at
        CHECK
(
            (status = 'PUBLISHED') =
(published_at IS NOT NULL)
        )
);

-- ----------------------------------------------------------------
-- Syllabus flights (ordered list of training exercises within a syllabus version)
-- ----------------------------------------------------------------
CREATE TABLE dto.syllabus_flights (
    flight_id             UUID        NOT NULL CONSTRAINT pk_dto_syllabus_flights PRIMARY KEY DEFAULT uuidv7(),
    syllabus_id           UUID        NOT NULL REFERENCES dto.syllabus (syllabus_id) ON DELETE CASCADE,
    sort_order            INTEGER     NOT NULL,
    code                  TEXT        NOT NULL,
    name                  TEXT        NOT NULL,
    description           TEXT,
    tags                  TEXT[]      NOT NULL DEFAULT '{}',
    is_interim_checkpoint BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_dto_syllabus_flights_code  UNIQUE (syllabus_id, code),
    CONSTRAINT uq_dto_syllabus_flights_order UNIQUE (syllabus_id, sort_order)
);

-- At most one interim checkpoint flight per syllabus version.
CREATE UNIQUE INDEX uix_dto_syllabus_flights_interim_checkpoint
    ON dto.syllabus_flights (syllabus_id)
    WHERE is_interim_checkpoint = TRUE;

-- ----------------------------------------------------------------
-- Syllabus flight items (training items inside a flight exercise)
-- ----------------------------------------------------------------
CREATE TABLE dto.syllabus_flight_items (
    item_id            UUID        NOT NULL CONSTRAINT pk_dto_syllabus_flight_items PRIMARY KEY DEFAULT uuidv7(),
    syllabus_flight_id UUID        NOT NULL REFERENCES dto.syllabus_flights (flight_id) ON DELETE CASCADE,
    sort_order         INTEGER     NOT NULL,
    name               TEXT        NOT NULL,
    description        TEXT,
    mandatory          BOOLEAN     NOT NULL DEFAULT FALSE,
    CONSTRAINT uq_dto_syllabus_flight_items_order UNIQUE (syllabus_flight_id, sort_order)
);

-- ----------------------------------------------------------------
-- Member <-> syllabus assignment
-- ----------------------------------------------------------------
-- Only one active assignment per member is enforced via a partial
-- unique index on (member_id) WHERE is_active.
CREATE TABLE dto.member_syllabus (
    member_syllabus_id UUID        NOT NULL CONSTRAINT pk_dto_member_syllabus PRIMARY KEY DEFAULT uuidv7(),
    member_id          VARCHAR(9)  NOT NULL REFERENCES member.register (member_id),
    syllabus_id        UUID        NOT NULL REFERENCES dto.syllabus (syllabus_id),
    is_active          BOOLEAN     NOT NULL DEFAULT TRUE,
    assigned_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    assigned_by        VARCHAR(9)  NOT NULL REFERENCES member.register (member_id),
    deactivated_at     TIMESTAMPTZ,
    CONSTRAINT chk_dto_member_syllabus_deactivated
        CHECK (
            (is_active = TRUE AND deactivated_at IS NULL)
            OR (is_active = FALSE AND deactivated_at IS NOT NULL)
        )
);

CREATE UNIQUE INDEX uix_dto_member_syllabus_active
    ON dto.member_syllabus (member_id)
    WHERE is_active = TRUE;

CREATE INDEX ix_dto_member_syllabus_syllabus
    ON dto.member_syllabus (syllabus_id);

-- ----------------------------------------------------------------
-- Syllabus flight attempts
-- ----------------------------------------------------------------
-- Links an actual flight log entry directly to a DTO syllabus flight
-- exercise. Each attempt corresponds to one flight.logs row; multiple
-- attempts can target the same syllabus_flight_id when the student
-- must re-fly an exercise (did not pass or one flight was not enough).
-- The UNIQUE constraint on flight_log_id ensures each flight log maps
-- to at most one DTO attempt record.
CREATE TABLE dto.syllabus_flight_attempts (
    attempt_id           UUID                    NOT NULL CONSTRAINT pk_dto_syllabus_flight_attempts PRIMARY KEY DEFAULT uuidv7(),
    flight_log_id        VARCHAR(9)              NOT NULL UNIQUE REFERENCES flight.logs (flight_id) ON DELETE CASCADE,
    syllabus_flight_id   UUID                    NOT NULL REFERENCES dto.syllabus_flights (flight_id),
    member_syllabus_id   UUID                    NOT NULL REFERENCES dto.member_syllabus (member_syllabus_id),
    instructor_member_id VARCHAR(9)              NOT NULL REFERENCES member.register (member_id),
    instructor_comments  TEXT,
    verification_result  dto.verification_result,
    verified_at          TIMESTAMPTZ,
    verified_by          VARCHAR(9)              REFERENCES member.register (member_id),
    created_at           TIMESTAMPTZ             NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ             NOT NULL DEFAULT now(),
    CONSTRAINT chk_dto_syllabus_flight_attempts_verified
        CHECK (
            (verification_result IS NULL AND verified_at IS NULL AND verified_by IS NULL)
            OR (verification_result IS NOT NULL AND verified_at IS NOT NULL AND verified_by IS NOT NULL)
        )
);

CREATE INDEX ix_dto_syllabus_flight_attempts_syllabus_flight
    ON dto.syllabus_flight_attempts (syllabus_flight_id);

CREATE INDEX ix_dto_syllabus_flight_attempts_instructor
    ON dto.syllabus_flight_attempts (instructor_member_id);

CREATE INDEX ix_dto_syllabus_flight_attempts_member_syllabus
    ON dto.syllabus_flight_attempts (member_syllabus_id);

-- ----------------------------------------------------------------
-- Per-item outcomes recorded by the instructor on a verified attempt
-- ----------------------------------------------------------------
CREATE TABLE dto.flight_item_outcomes (
    attempt_id UUID             NOT NULL REFERENCES dto.syllabus_flight_attempts (attempt_id) ON DELETE CASCADE,
    item_id    UUID             NOT NULL REFERENCES dto.syllabus_flight_items (item_id),
    outcome    dto.item_outcome NOT NULL,
    remarks    TEXT,
    created_at TIMESTAMPTZ      NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ      NOT NULL DEFAULT now(),
    CONSTRAINT pk_dto_flight_item_outcomes PRIMARY KEY (attempt_id, item_id)
);

-- ----------------------------------------------------------------
-- Hold Item List (HIL) queue
-- ----------------------------------------------------------------
-- Stakeholder decision (issue #569 comment): HIL is its own table so
-- it can be queried, displayed pre-flight, and have history.
-- An entry is "open" while resolved_at IS NULL. The partial unique
-- index ensures a member has at most one open entry per item.
CREATE TABLE dto.hil_queue (
    hil_id                 UUID             NOT NULL CONSTRAINT pk_dto_hil_queue PRIMARY KEY DEFAULT uuidv7(),
    member_id              VARCHAR(9)       NOT NULL REFERENCES member.register (member_id),
    syllabus_id            UUID             NOT NULL REFERENCES dto.syllabus (syllabus_id),
    item_id                UUID             NOT NULL REFERENCES dto.syllabus_flight_items (item_id),
    opened_on_attempt_id   UUID             NOT NULL REFERENCES dto.syllabus_flight_attempts (attempt_id),
    opened_at              TIMESTAMPTZ      NOT NULL DEFAULT now(),
    resolved_on_attempt_id UUID             REFERENCES dto.syllabus_flight_attempts (attempt_id),
    resolved_at            TIMESTAMPTZ,
    resolution_outcome     dto.item_outcome,
    notes                  TEXT,
    CONSTRAINT chk_dto_hil_queue_resolved
        CHECK (
            (resolved_at IS NULL AND resolved_on_attempt_id IS NULL AND resolution_outcome IS NULL)
            OR (resolved_at IS NOT NULL AND resolved_on_attempt_id IS NOT NULL AND resolution_outcome IS NOT NULL)
        )
);

CREATE UNIQUE INDEX uix_dto_hil_queue_open_per_member_item
    ON dto.hil_queue (member_id, item_id)
    WHERE resolved_at IS NULL;

CREATE INDEX ix_dto_hil_queue_member
    ON dto.hil_queue (member_id);

-- ----------------------------------------------------------------
-- Permissions ( ${app_db_user} is replaced by Flyway )
-- ----------------------------------------------------------------
GRANT USAGE ON SCHEMA dto TO ${app_db_user};
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA dto TO ${app_db_user};
ALTER DEFAULT PRIVILEGES IN SCHEMA dto
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${app_db_user};
GRANT USAGE ON TYPE dto.syllabus_status TO ${app_db_user};
GRANT USAGE ON TYPE dto.item_outcome TO ${app_db_user};
GRANT USAGE ON TYPE dto.verification_result TO ${app_db_user};
