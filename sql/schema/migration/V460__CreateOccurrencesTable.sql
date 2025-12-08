CREATE TABLE flight.occurrences (
    report_id VARCHAR(9) NOT NULL CONSTRAINT pk_occurrences PRIMARY KEY,
    status occurrenceStatus NOT NULL DEFAULT 'NEW',

    occurrence_date TIMESTAMPTZ NOT NULL,
    report_date TIMESTAMPTZ NOT NULL,
    dead_line TIMESTAMPTZ,

    headline VARCHAR(255) NOT NULL,
    location VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,

    categories JSONB NOT NULL,

    is_dto_report BOOLEAN NOT NULL,
    is_weather_relevant BOOLEAN,

    animal_number VARCHAR(16),
    animal_size VARCHAR(16),
    animal_species VARCHAR(255),

    registration VARCHAR(10) NOT NULL REFERENCES flight.aircraft (registration),
    departure_airport VARCHAR(10) NOT NULL REFERENCES static.airfields (ident),
    arrival_airport VARCHAR(10) NOT NULL REFERENCES static.airfields (ident),

    linked_report_id VARCHAR(9) REFERENCES flight.occurrences (report_id),
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(9) NOT NULL REFERENCES member.register (member_id),
    updated_by VARCHAR(9) NOT NULL REFERENCES member.register (member_id)
);