-- Create aircraft pricing table with date range support
-- Prices are defined per minute and can have validity periods
CREATE TABLE accts.aircraft_pricing (
    -- Primary key: composite of registration and valid_from ensures
    -- unique price periods
    registration VARCHAR(10) NOT NULL,
    valid_from DATE NOT NULL,
    valid_to DATE NULL,
    price_per_min NUMERIC(10, 2) NOT NULL,
    -- Metadata
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by VARCHAR(9),
    updated_at TIMESTAMP DEFAULT NOW(),
    updated_by VARCHAR(9),
    notes TEXT,
    -- Primary key
    PRIMARY KEY (registration, valid_from),
    -- Foreign key to aircraft table
    CONSTRAINT fk_aircraft_pricing_aircraft FOREIGN KEY (registration) REFERENCES flight.aircraft (registration) ON DELETE RESTRICT ON UPDATE CASCADE,
    -- Foreign keys to member register for audit trail
    CONSTRAINT fk_aircraft_pricing_created_by FOREIGN KEY (created_by) REFERENCES member.register (member_id) ON DELETE
    SET NULL ON UPDATE CASCADE,
        CONSTRAINT fk_aircraft_pricing_updated_by FOREIGN KEY (updated_by) REFERENCES member.register (member_id) ON DELETE
    SET NULL ON UPDATE CASCADE,
        -- Price must be positive
        CONSTRAINT chk_price_positive CHECK (price_per_min > 0),
        -- If valid_to is specified, it must be >= valid_from
        CONSTRAINT chk_valid_date_range CHECK (
            valid_to IS NULL
            OR valid_to >= valid_from
        )
);
-- Covering index for date range queries and current price lookups
CREATE INDEX idx_aircraft_pricing_dates ON accts.aircraft_pricing (registration, valid_from, valid_to) INCLUDE (price_per_min);
-- Ensure only one "current" price (valid_to = NULL) per aircraft
CREATE UNIQUE INDEX idx_aircraft_pricing_one_current ON accts.aircraft_pricing (registration)
WHERE valid_to IS NULL;
-- Function to validate and maintain continuous date ranges
CREATE OR REPLACE FUNCTION accts.check_aircraft_pricing_no_overlap() RETURNS TRIGGER AS $$
DECLARE v_existing_open_valid_from DATE;
BEGIN -- Auto-close existing open range if new row starts after it
IF TG_OP = 'INSERT' THEN -- Find existing row with valid_to = NULL for this aircraft
SELECT valid_from INTO v_existing_open_valid_from
FROM accts.aircraft_pricing
WHERE registration = NEW.registration
    AND valid_to IS NULL;
IF FOUND
AND NEW.valid_from > v_existing_open_valid_from THEN -- Close the existing open range by setting valid_to
UPDATE accts.aircraft_pricing
SET valid_to = NEW.valid_from - INTERVAL '1 day',
    updated_at = NOW()
WHERE registration = NEW.registration
    AND valid_to IS NULL;
END IF;
END IF;
-- Check for overlapping date ranges
IF EXISTS (
    SELECT 1
    FROM accts.aircraft_pricing
    WHERE registration = NEW.registration
        AND (registration, valid_from) != (NEW.registration, NEW.valid_from)
        AND (
            -- New range overlaps with existing range
            (
                NEW.valid_from <= COALESCE(valid_to, '9999-12-31'::DATE)
                AND COALESCE(NEW.valid_to, '9999-12-31'::DATE) >= valid_from
            )
        )
) THEN RAISE EXCEPTION 'Date range overlaps with existing pricing period for aircraft %',
NEW.registration;
END IF;
-- Check for gaps in date ranges (continuity)
-- Allow gap only if this is the first price for the aircraft
IF EXISTS (
    SELECT 1
    FROM accts.aircraft_pricing
    WHERE registration = NEW.registration
        AND (registration, valid_from) != (NEW.registration, NEW.valid_from)
) THEN -- There are other prices, check for gaps
IF NOT EXISTS (
    SELECT 1
    FROM accts.aircraft_pricing
    WHERE registration = NEW.registration
        AND (registration, valid_from) != (NEW.registration, NEW.valid_from)
        AND (
            -- New range starts immediately after an existing range ends
            valid_to = NEW.valid_from - INTERVAL '1 day'
            OR -- New range ends immediately before an existing range starts
            NEW.valid_to = valid_from - INTERVAL '1 day'
            OR -- One of them is open-ended (NULL)
            valid_to IS NULL
            OR NEW.valid_to IS NULL
        )
) THEN RAISE EXCEPTION 'Date range creates a gap in pricing periods for aircraft %. Ranges must be continuous.',
NEW.registration;
END IF;
END IF;
RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- Trigger to enforce non-overlapping date ranges
CREATE TRIGGER trg_aircraft_pricing_no_overlap BEFORE
INSERT
    OR
UPDATE ON accts.aircraft_pricing FOR EACH ROW EXECUTE FUNCTION accts.check_aircraft_pricing_no_overlap();