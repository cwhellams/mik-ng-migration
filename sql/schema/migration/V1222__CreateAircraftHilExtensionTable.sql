CREATE TABLE flight.aircraft_hil_extension (
  extension_id   UUID        NOT NULL DEFAULT gen_random_uuid(),
  hil_id         UUID        NOT NULL,
  extension_date TIMESTAMPTZ NOT NULL,
  name           TEXT        NOT NULL,
  extension_due  TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     TEXT        NOT NULL,

  CONSTRAINT hil_extension_pkey PRIMARY KEY (extension_id),
  CONSTRAINT hil_extension_hil_fk FOREIGN KEY (hil_id)
    REFERENCES flight.aircraft_hil (hil_id)
);

CREATE INDEX hil_extension_hil_idx
  ON flight.aircraft_hil_extension (hil_id);

CREATE TABLE flight.aircraft_hil_extension_audit (
  audit_id       SERIAL      PRIMARY KEY,
  extension_id   UUID        NOT NULL,
  operation_type TEXT        NOT NULL,
  changed_data   JSONB,
  new_data       JSONB,
  changed_by     TEXT        NOT NULL,
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION flight.aircraft_hil_extension_audit_trigger_function()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO flight.aircraft_hil_extension_audit (extension_id, operation_type, changed_data, changed_by)
    VALUES (OLD.extension_id, 'DELETE', to_jsonb(OLD), OLD.created_by);

  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO flight.aircraft_hil_extension_audit (extension_id, operation_type, changed_data, new_data, changed_by)
    VALUES (NEW.extension_id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), NEW.created_by);

  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO flight.aircraft_hil_extension_audit (extension_id, operation_type, new_data, changed_by)
    VALUES (NEW.extension_id, 'INSERT', to_jsonb(NEW), NEW.created_by);
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER aircraft_hil_extension_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON flight.aircraft_hil_extension
FOR EACH ROW EXECUTE FUNCTION flight.aircraft_hil_extension_audit_trigger_function();
