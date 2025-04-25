CREATE TABLE flight.logs
(
    flight_id VARCHAR(9) NOT NULL CONSTRAINT pk_flight_logs PRIMARY KEY,
    aircraft_registration VARCHAR(10) NOT NULL,
    billable_member_id VARCHAR(9) NOT NULL REFERENCES member.register (
        member_id
    ),
    pic_member_id VARCHAR(9) NOT NULL REFERENCES member.register (member_id),
    pic_role CREW_ROLE NOT NULL,
    crew2_member_id VARCHAR(9) DEFAULT NULL REFERENCES member.register (
        member_id
    ),
    crew2_role CREW_ROLE,
    crew3_member_id VARCHAR(9) DEFAULT NULL REFERENCES member.register (
        member_id
    ),
    crew3_role CREW_ROLE,
    crew4_member_id VARCHAR(9) DEFAULT NULL REFERENCES member.register (
        member_id
    ),
    crew4_role CREW_ROLE,
    persons_on_board SMALLINT NOT NULL,
    off_block_time_epoch BIGINT NOT NULL,
    takeoff_time_epoch BIGINT NOT NULL,
    landing_time_epoch BIGINT NOT NULL,
    on_block_time_epoch BIGINT NOT NULL,
    night_flying_mins SMALLINT NOT NULL,
    instrument_flying_mins SMALLINT NOT NULL,
    number_of_landings SMALLINT NOT NULL,
    departure_airport VARCHAR(10) NOT NULL REFERENCES static.airfields (ident),
    arrival_airport VARCHAR(10) NOT NULL REFERENCES static.airfields (ident),
    oil_uplift_litres DECIMAL(5, 2) NOT NULL,
    fuel_uplift_litres DECIMAL(5, 2) NOT NULL,
    fuel_remaining_litres DECIMAL(5, 2) NOT NULL,
    invoice_number VARCHAR(50) DEFAULT NULL,
    is_billed BOOLEAN NOT NULL GENERATED ALWAYS AS (
        invoice_number IS NOT NULL
    ) STORED,
    is_dto_training_flight BOOLEAN NOT NULL,
    flight_type VARCHAR(5) NOT NULL,
    billing_remarks TEXT,
    personal_remarks TEXT,
    incident_or_observations TEXT,
    is_billable_flight BOOLEAN NOT NULL,
    non_billing_reason VARCHAR(255),
    non_billing_approved_by_member_id VARCHAR(9) REFERENCES member.register (
        member_id
    ),
    priv_or_com_flight CHAR(1) NOT NULL CHECK (
        priv_or_com_flight IN ('P', 'C')
    ),
    -- P = Private, C = Commercial
    ajlb_seq_no SMALLINT NOT NULL, --Aircraft Journey Log Book
    ajlb_blank_rows_before SMALLINT NOT NULL,
    total_time_in_service DECIMAL(7, 2) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(9) NOT NULL REFERENCES member.register (member_id),
    updated_by VARCHAR(9) NOT NULL REFERENCES member.register (member_id),
    status FLIGHT_LOG_STATUS NOT NULL DEFAULT 'NEW',
    FOREIGN KEY (aircraft_registration) REFERENCES flight.aircraft (
        registration
    ),
    -- CHECK constraints to ensure timestamps are aligned to whole minutes
    CONSTRAINT check_all_times_in_mins CHECK (
        on_block_time_epoch % 60 = 0
        AND off_block_time_epoch % 60 = 0
        AND takeoff_time_epoch % 60 = 0
        AND landing_time_epoch % 60 = 0
    ),

    CONSTRAINT check_flight_time_sequence
    CHECK (
        on_block_time_epoch > landing_time_epoch
        AND landing_time_epoch > takeoff_time_epoch
        AND takeoff_time_epoch > off_block_time_epoch
    ),
    CONSTRAINT check_fuel_oil_pob_ldg_reasonable
    CHECK (
        fuel_uplift_litres >= 0
        AND oil_uplift_litres >= 0
        AND fuel_remaining_litres >= 0
        AND persons_on_board >= 1
        AND number_of_landings >= 1
    ),
    CONSTRAINT check_epochs_not_future
    CHECK (
        on_block_time_epoch <= EXTRACT(EPOCH FROM NOW())
        AND off_block_time_epoch <= EXTRACT(EPOCH FROM NOW())
        AND takeoff_time_epoch <= EXTRACT(EPOCH FROM NOW())
        AND landing_time_epoch <= EXTRACT(EPOCH FROM NOW())
    ),
    -- Computed columns to convert BIGINT timestamps to TIMESTAMPTZ
    off_block_time_utc TIMESTAMPTZ GENERATED ALWAYS AS (
        TO_TIMESTAMP(off_block_time_epoch)
    ) STORED,
    takeoff_time_utc TIMESTAMPTZ GENERATED ALWAYS AS (
        TO_TIMESTAMP(takeoff_time_epoch)
    ) STORED,
    landing_time_utc TIMESTAMPTZ GENERATED ALWAYS AS (
        TO_TIMESTAMP(landing_time_epoch)
    ) STORED,
    on_block_time_utc TIMESTAMPTZ GENERATED ALWAYS AS (
        TO_TIMESTAMP(on_block_time_epoch)
    ) STORED,
    block_mins INTEGER
    GENERATED ALWAYS AS (
        (on_block_time_epoch - off_block_time_epoch) / 60
    ) STORED,
    flight_mins INTEGER
    GENERATED ALWAYS AS (
        (landing_time_epoch - takeoff_time_epoch) / 60
    ) STORED,
    block_time TEXT
    GENERATED ALWAYS AS (
        EPOCH_DIFF_TO_HHMM(off_block_time_epoch, on_block_time_epoch)
    ) STORED,
    flight_time TEXT
    GENERATED ALWAYS AS (
        EPOCH_DIFF_TO_HHMM(takeoff_time_epoch, landing_time_epoch)
    ) STORED
);
