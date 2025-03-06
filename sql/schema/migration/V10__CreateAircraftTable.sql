CREATE TABLE flight.aircraft
(
    registration VARCHAR(10) UNIQUE NOT NULL PRIMARY KEY,
    display_name VARCHAR(50) NOT NULL,
    model VARCHAR(50) NOT NULL,
    manufacturer VARCHAR(50) NOT NULL,
    year_of_manufacture INT NOT NULL,
    total_hours DECIMAL(10, 2) NOT NULL DEFAULT 0.0,
    engine_tbo_hours INT NOT NULL,
    prop_tbo_hours INT NOT NULL,
    hours_at_last_engine_overhaul DECIMAL(10, 2) NOT NULL,
    hours_at_last_prop_overhaul DECIMAL(10, 2) NOT NULL,
    engine_hours_remaining_before_tbo DECIMAL(10, 2) GENERATED ALWAYS AS (
        engine_tbo_hours - (total_hours - hours_at_last_engine_overhaul)
    ) STORED,
    prop_hours_remaining_before_tbo DECIMAL(10, 2) GENERATED ALWAYS AS (
        prop_tbo_hours - (total_hours - hours_at_last_prop_overhaul)
    ) STORED,
    last_annual DATE NULL,
    next_annual DATE NULL,
    last_100hr DATE NULL,
    last_50hr DATE NULL,
    last_100hr_tach DECIMAL(10, 2) NULL,
    next_100hr_tach DECIMAL(10, 2) GENERATED ALWAYS AS (
        last_100hr_tach + 100
    ) STORED,
    last_50hr_tach DECIMAL(10, 2) NULL,
    next_50hr_tach DECIMAL(10, 2) GENERATED ALWAYS AS (
        last_50hr_tach + 50
    ) STORED,
    insurance_cert_expiry DATE NULL,
    radio_cert_expiry DATE NULL,
    transponder_cert_expiry DATE NULL,
    elt_cert_expiry DATE NULL,
    gps_cert_expiry DATE NULL,
    harness_expiry DATE NULL,
    equipment VARCHAR(255),
    hourly_rate_eur DECIMAL(10, 2) NOT NULL
);
