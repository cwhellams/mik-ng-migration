-- flight.maintenance_note.hil_id was added before the aircraft-HIL feature
-- existed and its FK actually points at dto.hil_queue (an unrelated training
-- "hold" queue that happens to share the name). No code path reads or writes
-- it for aircraft hold items; that relationship is expressed the other way
-- round via flight.aircraft_hil.resolved_note_id instead.
ALTER TABLE flight.maintenance_note
  DROP CONSTRAINT maintenance_note_hil_fk;

ALTER TABLE flight.maintenance_note
  DROP COLUMN hil_id;
