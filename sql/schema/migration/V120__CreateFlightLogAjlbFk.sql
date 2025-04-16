ALTER TABLE flight.logs
ADD CONSTRAINT fk_ajlb_logs
FOREIGN KEY (aircraft_registration, ajlb_seq_no)
REFERENCES flight.aircraft_journey_log_book (
    aircraft_registration, seq_no
);
