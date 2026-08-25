-- ============================================================
-- V2030__CreateInventoryReservationCapacityTrigger
--
-- The database-level backstop for item reservation capacity (#1139), playing
-- the same role schedule.no_overlaps_function (V325) plays for bookings. The
-- app layer pre-checks so members get a clean 400 rather than a raw Postgres
-- exception, but the arithmetic that decides "is there room" lives here only —
-- re-deriving it in JS would give two answers that can disagree under
-- concurrency.
-- ============================================================

-- What counts as capacity, defined once so the trigger below and the app's
-- friendly pre-check cannot drift apart.
--
-- RESERVED and ON_LOAN units are in service and do count: a vest signed out
-- today is still reservable for next week. MAINTENANCE, LOST and RETIRED units
-- do not — they have left the pool, and a reservation resting on one would be
-- a promise the club cannot keep.
CREATE OR REPLACE FUNCTION inventory.in_service_unit_count(p_item_id VARCHAR)
RETURNS INTEGER AS $$
    SELECT count(*)::INTEGER
      FROM inventory.item_units
     WHERE item_id = p_item_id
       AND is_active
       AND status NOT IN ('MAINTENANCE', 'LOST', 'RETIRED');
$$ LANGUAGE sql STABLE;

-- Two distinct checks, because a reservation naming a specific unit both
--   (a) must not collide with another reservation naming that same unit, and
--   (b) still consumes one of the item's units, alongside pooled reservations.
CREATE OR REPLACE FUNCTION inventory.check_reservation_capacity() RETURNS trigger AS $$
DECLARE
    in_service          INTEGER;
    committed           INTEGER;
    same_unit_conflicts INTEGER;
BEGIN
    -- A cancelled reservation holds nothing.
    IF NEW.reservation_status <> 'CONFIRMED' THEN
        RETURN NEW;
    END IF;

    IF NEW.unit_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM inventory.item_units
             WHERE unit_id = NEW.unit_id AND item_id = NEW.item_id
        ) THEN
            RAISE EXCEPTION 'Unit does not belong to this item';
        END IF;

        SELECT count(*) INTO same_unit_conflicts
          FROM inventory.reservations
         WHERE unit_id = NEW.unit_id
           AND reservation_status = 'CONFIRMED'
           AND start_time_epoch < NEW.end_time_epoch
           AND end_time_epoch > NEW.start_time_epoch
           AND reservation_id <> NEW.reservation_id;

        IF same_unit_conflicts > 0 THEN
            RAISE EXCEPTION 'This unit is already reserved for an overlapping time';
        END IF;
    END IF;

    in_service := inventory.in_service_unit_count(NEW.item_id);

    SELECT COALESCE(sum(quantity), 0) INTO committed
      FROM inventory.reservations
     WHERE item_id = NEW.item_id
       AND reservation_status = 'CONFIRMED'
       AND start_time_epoch < NEW.end_time_epoch
       AND end_time_epoch > NEW.start_time_epoch
       AND reservation_id <> NEW.reservation_id;

    IF committed + NEW.quantity > in_service THEN
        RAISE EXCEPTION 'Not enough available units for this item in the requested window';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_reservation_capacity_trigger
AFTER INSERT OR UPDATE ON inventory.reservations
FOR EACH ROW EXECUTE FUNCTION inventory.check_reservation_capacity();
