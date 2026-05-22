-- Create table to store baseline landing counts per aircraft
-- Used for backfilling historical landing data across all logbooks
CREATE TABLE flight.aircraft_landings_baseline (
    aircraft_registration VARCHAR(10) PRIMARY KEY REFERENCES flight.aircraft(registration) ON DELETE CASCADE,
    baseline_landings INT NOT NULL CHECK (baseline_landings >= 0),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(10) REFERENCES member_register(member_id) ON DELETE SET NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(10) REFERENCES member_register(member_id) ON DELETE SET NULL
);

-- Create index for audit queries
CREATE INDEX idx_aircraft_landings_baseline_created_by ON flight.aircraft_landings_baseline(created_by);
CREATE INDEX idx_aircraft_landings_baseline_updated_by ON flight.aircraft_landings_baseline(updated_by);
