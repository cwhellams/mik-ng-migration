ALTER TABLE flight.logs
ADD COLUMN ajlb_total_landings INT;

-- Backfill cumulative landings for already-validated rows, mirroring the
-- snapshot logic in updateFlightLogStatus (ac_total_landings from vw_flight_logs).
-- For each validated flight: start_landings (from AJLB) + running sum of
-- number_of_landings ordered by off_block_time_epoch within each logbook.
WITH cumulative AS (
    SELECT
        l.flight_id,
        ajlb.start_landings + SUM(l.number_of_landings) OVER (
            PARTITION BY l.aircraft_registration, l.ajlb_seq_no
            ORDER BY l.off_block_time_epoch
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS total_landings
    FROM flight.logs AS l
    JOIN flight.aircraft_journey_log_book AS ajlb
        ON ajlb.aircraft_registration = l.aircraft_registration
        AND ajlb.seq_no = l.ajlb_seq_no
    WHERE l.status != 'NEW'
)
UPDATE flight.logs
SET ajlb_total_landings = c.total_landings
FROM cumulative AS c
WHERE flight.logs.flight_id = c.flight_id;
