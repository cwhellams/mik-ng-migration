CREATE TABLE flight.maintenance_note (
  note_id               UUID        NOT NULL DEFAULT gen_random_uuid(),
  aircraft_registration TEXT        NOT NULL,
  ajlb_seq_no           INTEGER     NOT NULL,
  description           TEXT        NOT NULL,
  performed_by          TEXT        NOT NULL,
  flight_mins           INTEGER     NOT NULL,
  blank_rows_after      SMALLINT    NOT NULL DEFAULT 0,
  hil_id                UUID        NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            TEXT        NOT NULL,

  CONSTRAINT maintenance_note_flight_mins_check CHECK (flight_mins >= 0),
  CONSTRAINT maintenance_note_blank_rows_after_check CHECK (blank_rows_after >= 0),
  CONSTRAINT maintenance_note_pkey PRIMARY KEY (note_id),
  CONSTRAINT maintenance_note_ajlb_fk FOREIGN KEY (aircraft_registration, ajlb_seq_no)
    REFERENCES flight.aircraft_journey_log_book (aircraft_registration, seq_no),
  CONSTRAINT maintenance_note_hil_fk FOREIGN KEY (hil_id)
    REFERENCES dto.hil_queue (hil_id)
);

CREATE INDEX maintenance_note_ajlb_idx
  ON flight.maintenance_note (aircraft_registration, ajlb_seq_no);
