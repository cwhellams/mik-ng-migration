-- Remarks (#1226): minor, non-airworthiness observations a pilot can log against a
-- flight, split out from defects. Unlike flight.defect, a remark has no lifecycle
-- (no status, no HIL link, nothing to resolve) and is never placed on the printed
-- aircraft journey logbook -- it's purely "for your information", always tied to the
-- flight it was written on, and surfaced on the flight log admin dashboard.
CREATE TABLE flight.remark (
  remark_id   UUID        NOT NULL DEFAULT gen_random_uuid(),
  flight_id   TEXT        NOT NULL,
  description TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  TEXT        NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  TEXT        NOT NULL,

  CONSTRAINT remark_pkey      PRIMARY KEY (remark_id),
  CONSTRAINT remark_flight_fk FOREIGN KEY (flight_id)
    REFERENCES flight.logs (flight_id)
);

CREATE INDEX remark_flight_idx     ON flight.remark (flight_id);
CREATE INDEX remark_created_at_idx ON flight.remark (created_at);

CREATE TABLE flight.remark_audit (
  audit_id       SERIAL      PRIMARY KEY,
  remark_id      UUID        NOT NULL,
  operation_type TEXT        NOT NULL,
  changed_data   JSONB,
  new_data       JSONB,
  changed_by     TEXT        NOT NULL,
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION flight.remark_audit_trigger_function()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO flight.remark_audit (remark_id, operation_type, changed_data, changed_by)
    VALUES (OLD.remark_id, 'DELETE', to_jsonb(OLD), OLD.updated_by);

  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO flight.remark_audit (remark_id, operation_type, changed_data, new_data, changed_by)
    VALUES (NEW.remark_id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), NEW.updated_by);

  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO flight.remark_audit (remark_id, operation_type, new_data, changed_by)
    VALUES (NEW.remark_id, 'INSERT', to_jsonb(NEW), NEW.created_by);
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER remark_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON flight.remark
FOR EACH ROW EXECUTE FUNCTION flight.remark_audit_trigger_function();
