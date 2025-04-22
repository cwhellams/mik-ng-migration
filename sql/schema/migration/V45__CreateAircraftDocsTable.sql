CREATE TABLE flight.aircraft_documents
(
    registration VARCHAR(10) REFERENCES flight.aircraft(registration),
    document_id VARCHAR(16) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    alert_days_before INT,
    soft_limit INT,
    hard_limit INT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(9) NOT NULL REFERENCES member.register (member_id),
    updated_by VARCHAR(9) NOT NULL REFERENCES member.register (member_id),
    CONSTRAINT pk_aircraft_documents PRIMARY KEY (registration, document_id)
);