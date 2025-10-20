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
-- 
CREATE TRIGGER no_overlap_trigger
AFTER
INSERT
    OR
UPDATE ON flight.logs FOR EACH ROW EXECUTE FUNCTION flight.no_overlaps_function();