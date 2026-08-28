-- Issue #1254: a maintenance note's / defect's date was whatever created_at happened to
-- be, i.e. the moment someone got round to typing it in. Work found on the ramp on a
-- Friday and entered on the Monday therefore appeared in the journey log book under the
-- Monday's date, which is not what the physical book says and not correctable afterwards.
--
-- recorded_on is that date as a real, editable field: the day the work was performed /
-- the defect was observed. created_at stays what it has always been — audit metadata for
-- when the row was written — and the logbook's row/page sequencing keeps ordering by it
-- (flight.vw_ajlb_live_sequence), so this column changes what is displayed and nothing
-- about where an item sits on a page.
--
-- Existing rows are backfilled from created_at in Helsinki wall-clock time, matching the
-- date the UI has been rendering for them all along (@mik/ui's formatDate over the club's
-- timezone) rather than the UTC date, which differs for anything entered late evening.
--
-- The column default is Helsinki's calendar date for the same reason, and deliberately not
-- CURRENT_DATE: the backend's pool pins every session to timezone=UTC (db/connection.ts),
-- so CURRENT_DATE rolls over at 02:00/03:00 Helsinki and anything falling back to the
-- default late on an evening would be filed under tomorrow. The application always sends
-- the column explicitly (toHelsinkiDate() in @mik/contracts/date), so this is the net under
-- ad-hoc SQL and future inserts that forget the field, and it has to agree with them.

ALTER TABLE flight.maintenance_note
  ADD COLUMN recorded_on DATE NULL;

UPDATE flight.maintenance_note
  SET recorded_on = (created_at AT TIME ZONE 'Europe/Helsinki')::date;

ALTER TABLE flight.maintenance_note
  ALTER COLUMN recorded_on SET NOT NULL,
  ALTER COLUMN recorded_on SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Helsinki')::date;

ALTER TABLE flight.defect
  ADD COLUMN recorded_on DATE NULL;

UPDATE flight.defect
  SET recorded_on = (created_at AT TIME ZONE 'Europe/Helsinki')::date;

ALTER TABLE flight.defect
  ALTER COLUMN recorded_on SET NOT NULL,
  ALTER COLUMN recorded_on SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Helsinki')::date;
