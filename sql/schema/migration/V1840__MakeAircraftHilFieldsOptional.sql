-- Business owner and CAMO confirmed that defect category, source ref and due
-- date are not always known when a hold item is opened, so they stop being
-- mandatory. A hold item with no due date can never be overdue and therefore
-- never grounds the aircraft, and it cannot be extended (nothing to extend).
ALTER TABLE flight.aircraft_hil
  ALTER COLUMN defect_cat DROP NOT NULL,
  ALTER COLUMN source_ref DROP NOT NULL,
  ALTER COLUMN due_date   DROP NOT NULL;
