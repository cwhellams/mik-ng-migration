-- ============================================================
-- V1070 – Create notification banner table
-- ============================================================
-- Stores a single system-wide notification banner that can be
-- set by admins to communicate service status or other information
-- to all users, including those who are not logged in.
-- ============================================================

CREATE TABLE notification_banner (
    id         INTEGER      NOT NULL DEFAULT 1,
    enabled    BOOLEAN NOT NULL DEFAULT FALSE,
    message    TEXT,
    severity   VARCHAR(10)  NOT NULL DEFAULT 'info',
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_by VARCHAR(9),
    CONSTRAINT pk_notification_banner PRIMARY KEY (id),
    CONSTRAINT chk_notification_banner_severity
        CHECK (severity IN ('info', 'warning', 'error', 'success')),
    CONSTRAINT chk_notification_banner_single_row
        CHECK (id = 1)
);

-- Insert the single row (empty banner by default)
INSERT INTO notification_banner (id, message, severity) VALUES (1, NULL, 'info');

-- Grant permissions to the app user
GRANT SELECT, UPDATE ON notification_banner TO ${app_db_user};
