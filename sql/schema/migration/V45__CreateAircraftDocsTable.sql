CREATE TABLE flight.aircraft_documents
(
    registration VARCHAR(10) REFERENCES flight.aircraft(registration),
    document_id VARCHAR(16) NOT NULL,
    display_name VARCHAR(50) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    alert_days_before INT,
    soft_limit INT,
    hard_limit INT,
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(9) NOT NULL REFERENCES member.register (member_id),
    updated_by VARCHAR(9) NOT NULL REFERENCES member.register (member_id),
    CONSTRAINT pk_aircraft_documents PRIMARY KEY (registration, document_id)
);