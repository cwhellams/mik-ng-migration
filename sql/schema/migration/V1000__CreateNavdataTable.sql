-- Create aircraft navdata table for tracking navigation data updates
-- Records who performed the update, when, the cycle, and expiration date
CREATE TABLE flight.aircraft_navdata (
    navdata_id UUID NOT NULL DEFAULT uuidv7() CONSTRAINT pk_aircraft_navdata PRIMARY KEY,
    aircraft_registration VARCHAR(10) NOT NULL,
    updater_member_id VARCHAR(9) NOT NULL,   -- member who performed the navdata update
    update_date DATE NOT NULL,               -- date when the navdata was updated
    cycle VARCHAR(10) NOT NULL,              -- navdata cycle identifier (e.g. "2604")
    expires DATE NOT NULL,                   -- expiration date of the navdata
    -- Audit fields
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(9) NOT NULL,
    -- Foreign keys
    CONSTRAINT fk_aircraft_navdata_aircraft FOREIGN KEY (aircraft_registration)
        REFERENCES flight.aircraft (registration) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_aircraft_navdata_updater FOREIGN KEY (updater_member_id)
        REFERENCES member.register (member_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_aircraft_navdata_created_by FOREIGN KEY (created_by)
        REFERENCES member.register (member_id) ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Index for fast lookup by aircraft
CREATE INDEX idx_aircraft_navdata_registration ON flight.aircraft_navdata (aircraft_registration);

-- Grant permissions to application user
GRANT SELECT, INSERT, UPDATE, DELETE ON flight.aircraft_navdata TO ${app_db_user};
