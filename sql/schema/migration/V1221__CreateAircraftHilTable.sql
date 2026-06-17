CREATE TABLE flight.aircraft_hil (
  hil_id                UUID        NOT NULL DEFAULT gen_random_uuid(),
  aircraft_registration TEXT        NOT NULL,
  hil_number            INTEGER     NOT NULL,
  source_ref            TEXT        NOT NULL,
  defect_cat            TEXT        NOT NULL,
  description           TEXT        NOT NULL,
  open_date             TIMESTAMPTZ NOT NULL,
  name                  TEXT        NOT NULL,
  due_date              TIMESTAMPTZ NOT NULL,
  resolved_note_id      UUID        NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            TEXT        NOT NULL,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by            TEXT        NOT NULL,

  CONSTRAINT aircraft_hil_pkey PRIMARY KEY (hil_id),
  CONSTRAINT aircraft_hil_registration_fk FOREIGN KEY (aircraft_registration)
    REFERENCES flight.aircraft (registration),
  CONSTRAINT aircraft_hil_note_fk FOREIGN KEY (resolved_note_id)
    REFERENCES flight.maintenance_note (note_id),
  CONSTRAINT aircraft_hil_number_unique UNIQUE (aircraft_registration, hil_number)
);

CREATE INDEX aircraft_hil_registration_idx
  ON flight.aircraft_hil (aircraft_registration);

CREATE TABLE flight.aircraft_hil_audit (
  audit_id       SERIAL      PRIMARY KEY,
  hil_id         UUID        NOT NULL,
  operation_type TEXT        NOT NULL,
  changed_data   JSONB,
  new_data       JSONB,
  changed_by     TEXT        NOT NULL,
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION flight.aircraft_hil_audit_trigger_function()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO flight.aircraft_hil_audit (hil_id, operation_type, changed_data, changed_by)
    VALUES (OLD.hil_id, 'DELETE', to_jsonb(OLD), OLD.updated_by);

  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO flight.aircraft_hil_audit (hil_id, operation_type, changed_data, new_data, changed_by)
    VALUES (NEW.hil_id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), NEW.updated_by);

  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO flight.aircraft_hil_audit (hil_id, operation_type, new_data, changed_by)
    VALUES (NEW.hil_id, 'INSERT', to_jsonb(NEW), NEW.created_by);
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER aircraft_hil_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON flight.aircraft_hil
FOR EACH ROW EXECUTE FUNCTION flight.aircraft_hil_audit_trigger_function();
