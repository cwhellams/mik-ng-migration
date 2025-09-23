CREATE OR REPLACE FUNCTION schedule.no_overlaps_function() RETURNS trigger AS $$ BEGIN IF EXISTS (
        SELECT 1
        FROM schedule.bookings
        WHERE registration = NEW.registration
            AND booking_status = 'CONFIRMED'
            AND start_time_epoch < NEW.end_time_epoch
            AND end_time_epoch > NEW.start_time_epoch
            AND booking_id <> NEW.booking_id
    ) THEN RAISE EXCEPTION 'Overlapping booking';
END IF;
RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- 
CREATE TRIGGER register_audit_trigger
AFTER
INSERT
    OR
UPDATE ON schedule.bookings FOR EACH ROW EXECUTE FUNCTION schedule.no_overlaps_function();