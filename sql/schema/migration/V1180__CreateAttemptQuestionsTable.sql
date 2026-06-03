CREATE TABLE exam.attempt_questions (
    attempt_id   VARCHAR(9) NOT NULL REFERENCES exam.attempts(attempt_id)  ON DELETE CASCADE,
    question_id  VARCHAR(9) NOT NULL REFERENCES exam.questions(question_id),
    sort_order   INT        NOT NULL DEFAULT 0,
    PRIMARY KEY (attempt_id, question_id)
);

GRANT SELECT, INSERT, DELETE ON exam.attempt_questions TO ${app_db_user};
ALTER DEFAULT PRIVILEGES IN SCHEMA exam GRANT SELECT, INSERT, DELETE ON TABLES TO ${app_db_user};
