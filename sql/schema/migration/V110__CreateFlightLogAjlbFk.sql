ALTER TABLE flight.logs
ADD CONSTRAINT fk_ajlb_logs
FOREIGN KEY (aircraft_registration, ajlb_seq_number)
REFERENCES flight.aircraft_journey_log_book (
    aircraft_registration, ajlb_seq_no
);
