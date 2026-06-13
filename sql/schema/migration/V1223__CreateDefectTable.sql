CREATE TYPE flight.defect_status AS ENUM ('ACTIVE', 'MOVED_TO_HIL', 'RESOLVED');

CREATE TABLE flight.defect (
  defect_id             UUID                 NOT NULL DEFAULT gen_random_uuid(),
  aircraft_registration TEXT                 NOT NULL,
  ajlb_seq_no           INTEGER              NOT NULL,
  flight_id             TEXT                 NULL,
  description           TEXT                 NOT NULL,
  flight_mins           INTEGER              NOT NULL,
  blank_rows_after      SMALLINT             NOT NULL DEFAULT 0,
  status                flight.defect_status NOT NULL DEFAULT 'ACTIVE',
  hil_id                UUID                 NULL,
  resolved_note_id      UUID                 NULL,
  created_at            TIMESTAMPTZ          NOT NULL DEFAULT now(),
  created_by            TEXT                 NOT NULL,
  updated_at            TIMESTAMPTZ          NOT NULL DEFAULT now(),
  updated_by            TEXT                 NOT NULL,

  CONSTRAINT defect_pkey      PRIMARY KEY (defect_id),
  CONSTRAINT defect_ajlb_fk   FOREIGN KEY (aircraft_registration, ajlb_seq_no)
    REFERENCES flight.aircraft_journey_log_book (aircraft_registration, seq_no),
  CONSTRAINT defect_flight_fk FOREIGN KEY (flight_id)
    REFERENCES flight.flight_log (flight_id),
  CONSTRAINT defect_hil_fk    FOREIGN KEY (hil_id)
    REFERENCES flight.aircraft_hil (hil_id),
  CONSTRAINT defect_note_fk   FOREIGN KEY (resolved_note_id)
    REFERENCES flight.maintenance_note (note_id),
  CONSTRAINT defect_flight_mins_check  CHECK (flight_mins >= 0),
  CONSTRAINT defect_blank_rows_check   CHECK (blank_rows_after >= 0)
);

CREATE INDEX defect_ajlb_idx   ON flight.defect (aircraft_registration, ajlb_seq_no);
CREATE INDEX defect_status_idx ON flight.defect (aircraft_registration, status);

CREATE TABLE flight.defect_audit (
  audit_id       SERIAL      PRIMARY KEY,
  defect_id      UUID        NOT NULL,
  operation_type TEXT        NOT NULL,
  changed_data   JSONB,
  new_data       JSONB,
  changed_by     TEXT        NOT NULL,
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION flight.defect_audit_trigger_function()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO flight.defect_audit (defect_id, operation_type, changed_data, changed_by)
    VALUES (OLD.defect_id, 'DELETE', to_jsonb(OLD), OLD.updated_by);

  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO flight.defect_audit (defect_id, operation_type, changed_data, new_data, changed_by)
    VALUES (NEW.defect_id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), NEW.updated_by);

  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO flight.defect_audit (defect_id, operation_type, new_data, changed_by)
    VALUES (NEW.defect_id, 'INSERT', to_jsonb(NEW), NEW.created_by);
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER defect_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON flight.defect
FOR EACH ROW EXECUTE FUNCTION flight.defect_audit_trigger_function();
