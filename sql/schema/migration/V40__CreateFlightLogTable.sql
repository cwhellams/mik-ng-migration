CREATE TABLE flight.logs
(
    flight_id SERIAL PRIMARY KEY,
    captain INT NOT NULL,
    copilot INT,
    aircraft_registration VARCHAR(10) NOT NULL,
    flight_date DATE NOT NULL,
    on_block_time TIME NOT NULL,
    off_block_time TIME NOT NULL,
    takeoff_time TIME NOT NULL,
    landing_time TIME NOT NULL,
    oil_uplift_litres DECIMAL(5, 2),
    fuel_uplift_litres DECIMAL(5, 2),
    persons_on_board INT,
    number_of_landings INT,
    night_hours TIME,
    instrument_hours TIME,
    departure_airport VARCHAR(10) NOT NULL,
    arrival_airport VARCHAR(10) NOT NULL,
    invoice_number VARCHAR(50),
    is_billed BOOLEAN NOT NULL
    GENERATED ALWAYS AS
    (invoice_number IS NOT NULL) STORED,
    flight_type VARCHAR
    (50),
    billing_remarks TEXT,
    remarks TEXT,
    FOREIGN KEY
    (captain) REFERENCES member.register
    (member_id),
    FOREIGN KEY
    (copilot) REFERENCES member.register
    (member_id),
    FOREIGN KEY
    (aircraft_registration) REFERENCES flight.aircraft
    (registration)
);