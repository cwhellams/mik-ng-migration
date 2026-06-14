ALTER TABLE flight.maintenance_note
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN updated_by TEXT        NOT NULL DEFAULT '';

UPDATE flight.maintenance_note
  SET updated_at = created_at,
      updated_by = created_by;

CREATE TABLE flight.maintenance_note_audit (
  audit_id       SERIAL      PRIMARY KEY,
  note_id        UUID        NOT NULL,
  operation_type TEXT        NOT NULL,
  changed_data   JSONB,
  new_data       JSONB,
  changed_by     TEXT        NOT NULL,
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION flight.maintenance_note_audit_trigger_function()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO flight.maintenance_note_audit (note_id, operation_type, changed_data, changed_by)
    VALUES (OLD.note_id, 'DELETE', to_jsonb(OLD), OLD.updated_by);

  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO flight.maintenance_note_audit (note_id, operation_type, changed_data, new_data, changed_by)
    VALUES (NEW.note_id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), NEW.updated_by);

  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO flight.maintenance_note_audit (note_id, operation_type, new_data, changed_by)
    VALUES (NEW.note_id, 'INSERT', to_jsonb(NEW), NEW.created_by);
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER maintenance_note_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON flight.maintenance_note
FOR EACH ROW EXECUTE FUNCTION flight.maintenance_note_audit_trigger_function();
