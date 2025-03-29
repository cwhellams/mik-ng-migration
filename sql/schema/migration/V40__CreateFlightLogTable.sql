CREATE TABLE flight.logs
(
    flight_id SERIAL PRIMARY KEY,
    billable_member_id INT NOT NULL REFERENCES member.register (member_id),
    captain_member_id INT DEFAULT NULL REFERENCES member.register (member_id),
    captain VARCHAR(50) NOT NULL,
    copilot_member_id INT DEFAULT NULL REFERENCES member.register (member_id),
    copilot VARCHAR(50),
    aircraft_registration VARCHAR(10) NOT NULL,
    on_block_time_utc TIMESTAMP (0) WITH TIME ZONE NOT NULL,
    off_block_time_utc TIMESTAMP (0) WITH TIME ZONE NOT NULL,
    takeoff_time_utc TIMESTAMP (0) WITH TIME ZONE NOT NULL,
    landing_time_utc TIMESTAMP (0) WITH TIME ZONE NOT NULL,
    oil_uplift_litres DECIMAL(5, 2),
    fuel_uplift_litres DECIMAL(5, 2),
    persons_on_board SMALLINT NOT NULL,
    number_of_landings SMALLINT NOT NULL,
    night_hours TIME,
    instrument_hours TIME,
    departure_airport VARCHAR(10) NOT NULL,
    arrival_airport VARCHAR(10) NOT NULL,
    invoice_number VARCHAR(50) DEFAULT NULL,
    is_billed BOOLEAN NOT NULL GENERATED ALWAYS AS (
        invoice_number IS NOT NULL
    ) STORED,
    flight_type VARCHAR(5) NOT NULL,
    billing_remarks TEXT,
    remarks TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by INT NOT NULL REFERENCES member.register (member_id),
    updated_by INT NOT NULL REFERENCES member.register (member_id),
    is_billable_flight BOOLEAN NOT NULL DEFAULT FALSE,
    non_billing_reason VARCHAR(255),
    non_billing_approved_by_member_id INT DEFAULT NULL REFERENCES member.register (
        member_id
    ),
    FOREIGN KEY (aircraft_registration) REFERENCES flight.aircraft (
        registration
    )
);
