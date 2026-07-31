-- Issue #896: two flight log entries for the same aircraft could be saved with
-- the same off_block_time_epoch, or with otherwise overlapping time intervals.
--
-- The original guards in V105 did not catch this:
--   * the "Protected time period" check only looks at rows with status != 'NEW',
--     so two pending (NEW) entries could freely overlap each other;
--   * the "Duplicate flight log" check only fires when all four epoch timestamps
--     match exactly, so a shared off-block time with a different on-block time
--     slipped through.
--
-- This migration adds a third guard that rejects any interval overlap on the same
-- aircraft, regardless of status. The two existing guards are kept unchanged and
-- run first so their more specific error messages still win:
--   * "Protected time period" deliberately enforces chronological entry order
--     against already-validated flights (AJLB page/row/seq numbering is
--     sequential), and is intentionally left as it is.
--   * "Duplicate flight log" identifies an exact re-submission of the same row.
CREATE OR REPLACE FUNCTION flight.no_overlaps_function() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.status = 'NEW'::flight_log_status) THEN
        IF EXISTS (
            SELECT 1
            FROM flight.logs
            WHERE aircraft_registration = NEW.aircraft_registration
                AND status != 'NEW'::flight_log_status
                AND on_block_time_epoch > NEW.off_block_time_epoch
                AND flight_id != NEW.flight_id
        ) THEN RAISE EXCEPTION 'Protected time period';
        END IF;

        IF EXISTS (
            SELECT 1
            FROM flight.logs
            WHERE aircraft_registration = NEW.aircraft_registration
                AND off_block_time_epoch = NEW.off_block_time_epoch
                AND takeoff_time_epoch = NEW.takeoff_time_epoch
                AND landing_time_epoch = NEW.landing_time_epoch
                AND on_block_time_epoch = NEW.on_block_time_epoch
                AND flight_id != NEW.flight_id
        ) THEN RAISE EXCEPTION 'Duplicate flight log';
        END IF;

        -- Half-open interval comparison: two flights overlap when each one starts
        -- before the other one ends. Back-to-back flights (on-block of one equal to
        -- the off-block of the next) are not an overlap and stay allowed.
        IF EXISTS (
            SELECT 1
            FROM flight.logs
            WHERE aircraft_registration = NEW.aircraft_registration
                AND off_block_time_epoch < NEW.on_block_time_epoch
                AND on_block_time_epoch > NEW.off_block_time_epoch
                AND flight_id != NEW.flight_id
        ) THEN RAISE EXCEPTION 'Overlapping flight log entry';
        END IF;

    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.off_block_time_epoch <> OLD.off_block_time_epoch OR
            NEW.takeoff_time_epoch <> OLD.takeoff_time_epoch OR
            NEW.landing_time_epoch <> OLD.landing_time_epoch OR
            NEW.on_block_time_epoch <> OLD.on_block_time_epoch OR
            NEW.aircraft_registration <> OLD.aircraft_registration OR
            NEW.ajlb_seq_no <> OLD.ajlb_seq_no OR
            NEW.ajlb_page_number <> OLD.ajlb_page_number OR
            NEW.ajlb_row_number <> OLD.ajlb_row_number OR
            NEW.ajlb_total_flight_mins <> OLD.ajlb_total_flight_mins
        THEN
            RAISE EXCEPTION 'Protected field';
        END IF;
    END IF;

    RETURN NEW;
END;

$$ LANGUAGE plpgsql;
