-- Types
CREATE TYPE exam.exam_type AS ENUM ('AFM', 'SELF_STUDY', 'DTO', 'OTHER');
CREATE TYPE exam.exam_version_status AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');
CREATE TYPE exam.attempt_status AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'GRADED', 'ABANDONED');

-- Exam family
CREATE TABLE exam.exams (
    exam_id     VARCHAR(9)       PRIMARY KEY,
    exam_type   exam.exam_type   NOT NULL DEFAULT 'OTHER',
    name        TEXT             NOT NULL,
    created_at  TIMESTAMPTZ      NOT NULL DEFAULT now(),
    created_by  VARCHAR(9)       NOT NULL REFERENCES member.register(member_id),
    updated_at  TIMESTAMPTZ      NOT NULL DEFAULT now(),
    updated_by  VARCHAR(9)       NOT NULL REFERENCES member.register(member_id)
);

-- Versioned exam
CREATE TABLE exam.exam_versions (
    version_id           VARCHAR(9)               PRIMARY KEY,
    exam_id              VARCHAR(9)               NOT NULL REFERENCES exam.exams(exam_id) ON DELETE CASCADE,
    version_number       INT                      NOT NULL DEFAULT 1,
    status               exam.exam_version_status NOT NULL DEFAULT 'DRAFT',
    default_language     VARCHAR(5)               NOT NULL DEFAULT 'en',
    supported_languages  TEXT[]                   NOT NULL DEFAULT '{}',
    pass_percent         NUMERIC(5,2)             NOT NULL DEFAULT 75,
    created_at           TIMESTAMPTZ              NOT NULL DEFAULT now(),
    created_by           VARCHAR(9)               NOT NULL REFERENCES member.register(member_id),
    updated_at           TIMESTAMPTZ              NOT NULL DEFAULT now(),
    updated_by           VARCHAR(9)               NOT NULL REFERENCES member.register(member_id)
);

-- Only one PUBLISHED version per exam
CREATE UNIQUE INDEX uix_exam_versions_published
    ON exam.exam_versions (exam_id)
    WHERE status = 'PUBLISHED';

-- Translations for a version
CREATE TABLE exam.exam_version_translations (
    version_id  VARCHAR(9)  NOT NULL REFERENCES exam.exam_versions(version_id) ON DELETE CASCADE,
    language    VARCHAR(5)  NOT NULL,
    title       TEXT        NOT NULL,
    description TEXT,
    PRIMARY KEY (version_id, language)
);

-- Questions
CREATE TABLE exam.questions (
    question_id  VARCHAR(9)  PRIMARY KEY,
    version_id   VARCHAR(9)  NOT NULL REFERENCES exam.exam_versions(version_id) ON DELETE CASCADE,
    sort_order   INT         NOT NULL DEFAULT 0
);

-- Question translations
CREATE TABLE exam.question_translations (
    question_id  VARCHAR(9)  NOT NULL REFERENCES exam.questions(question_id) ON DELETE CASCADE,
    language     VARCHAR(5)  NOT NULL,
    prompt       TEXT        NOT NULL,
    reasoning    TEXT,
    PRIMARY KEY (question_id, language)
);

-- Choices
CREATE TABLE exam.choices (
    choice_id    VARCHAR(9)  PRIMARY KEY,
    question_id  VARCHAR(9)  NOT NULL REFERENCES exam.questions(question_id) ON DELETE CASCADE,
    is_correct   BOOLEAN     NOT NULL DEFAULT false,
    sort_order   INT         NOT NULL DEFAULT 0
);

-- Only one correct choice per question
CREATE UNIQUE INDEX uix_choices_correct
    ON exam.choices (question_id)
    WHERE is_correct = TRUE;

-- Choice translations
CREATE TABLE exam.choice_translations (
    choice_id  VARCHAR(9)  NOT NULL REFERENCES exam.choices(choice_id) ON DELETE CASCADE,
    language   VARCHAR(5)  NOT NULL,
    text       TEXT        NOT NULL,
    PRIMARY KEY (choice_id, language)
);

-- Attempts
CREATE TABLE exam.attempts (
    attempt_id      VARCHAR(9)           PRIMARY KEY,
    version_id      VARCHAR(9)           NOT NULL REFERENCES exam.exam_versions(version_id),
    member_id       VARCHAR(9)           NOT NULL REFERENCES member.register(member_id),
    language        VARCHAR(5)           NOT NULL DEFAULT 'en',
    status          exam.attempt_status  NOT NULL DEFAULT 'IN_PROGRESS',
    score_percent   NUMERIC(5,2),
    correct_count   INT,
    total_count     INT,
    passed          BOOLEAN,
    submitted_at    TIMESTAMPTZ,
    graded_at       TIMESTAMPTZ,
    abandoned_at    TIMESTAMPTZ,
    abandon_reason  TEXT,
    created_at      TIMESTAMPTZ          NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ          NOT NULL DEFAULT now()
);

-- Attempt answers
CREATE TABLE exam.attempt_answers (
    attempt_id   VARCHAR(9)  NOT NULL REFERENCES exam.attempts(attempt_id) ON DELETE CASCADE,
    question_id  VARCHAR(9)  NOT NULL REFERENCES exam.questions(question_id),
    choice_id    VARCHAR(9)  REFERENCES exam.choices(choice_id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (attempt_id, question_id)
);

-- Grant permissions (${app_db_user} is replaced by flyway)
GRANT USAGE ON SCHEMA exam TO ${app_db_user};
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA exam TO ${app_db_user};
ALTER DEFAULT PRIVILEGES IN SCHEMA exam GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${app_db_user};
GRANT USAGE ON TYPE exam.exam_type TO ${app_db_user};
GRANT USAGE ON TYPE exam.exam_version_status TO ${app_db_user};
GRANT USAGE ON TYPE exam.attempt_status TO ${app_db_user};
