CREATE TABLE flight.logs
(
    flight_id SERIAL PRIMARY KEY,
    billable_member_id INT NOT NULL,
    captain_member_id INT DEFAULT NULL,
    captain VARCHAR(50) NOT NULL,
    copilot_member_id INT DEFAULT NULL,
    copilot VARCHAR(50),
    aircraft_registration VARCHAR(10) NOT NULL,
    flight_date DATE NOT NULL,
    on_block_time_utc TIME NOT NULL,
    off_block_time_utc TIME NOT NULL,
    takeoff_time_utc TIME NOT NULL,
    landing_time_utc TIME NOT NULL,
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
    flight_type VARCHAR(50) NOT NULL,
    billing_remarks TEXT,
    remarks TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(50) NOT NULL,
    updated_by VARCHAR(50) NOT NULL,
    is_billable_flight BOOLEAN NOT NULL DEFAULT FALSE,
    non_billing_reason VARCHAR(255),
    non_billing_approved_by_member_id INT DEFAULT NULL,
    FOREIGN KEY (billable_member_id) REFERENCES member.register (member_id),
    FOREIGN KEY (captain_member_id) REFERENCES member.register (member_id),
    FOREIGN KEY (copilot_member_id) REFERENCES member.register (member_id),
    FOREIGN KEY (
        non_billing_approved_by_member_id
    ) REFERENCES member.register (member_id),
    FOREIGN KEY (aircraft_registration) REFERENCES flight.aircraft (
        registration
    )
);
