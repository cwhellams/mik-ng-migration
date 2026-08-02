CREATE TABLE flight.occurrence_attachments (
    attachment_id SERIAL PRIMARY KEY,
    report_id     VARCHAR(9) NOT NULL REFERENCES flight.occurrences (report_id),
    file_name     VARCHAR(255) NOT NULL,
    mime_type     VARCHAR(100) NOT NULL,
    file_size     INTEGER NOT NULL,
    storage_key   VARCHAR(500) NOT NULL,
    origin_status occurrenceStatus NOT NULL,

    removed_at TIMESTAMPTZ,
    removed_by VARCHAR(9) REFERENCES member.register (member_id),

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(9) NOT NULL REFERENCES member.register (member_id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(9) NOT NULL REFERENCES member.register (member_id)
);

CREATE INDEX idx_occurrence_attachments_report ON flight.occurrence_attachments (report_id);
