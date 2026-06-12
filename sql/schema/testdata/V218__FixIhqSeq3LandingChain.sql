-- Fix: V203 inserted OH-IHQ seq_no=3 with start_landings=0 (column default) and
-- the three validated flights without ajlb_total_landings. V60's backfill ran
-- before these rows existed so they were missed.
--
-- Step 1: chain start_landings from the end of book 2
UPDATE flight.aircraft_journey_log_book
SET start_landings = (
    SELECT COALESCE(last_val.ajlb_total_landings, prev.start_landings, 0)
    FROM flight.aircraft_journey_log_book prev
    LEFT JOIN (
        SELECT DISTINCT ON (aircraft_registration, ajlb_seq_no)
            aircraft_registration, ajlb_seq_no, ajlb_total_landings
        FROM flight.logs
        WHERE status != 'NEW'
        ORDER BY aircraft_registration, ajlb_seq_no, on_block_time_epoch DESC
    ) last_val ON last_val.aircraft_registration = prev.aircraft_registration
               AND last_val.ajlb_seq_no = prev.seq_no
    WHERE prev.aircraft_registration = 'OH-IHQ' AND prev.seq_no = 2
)
WHERE aircraft_registration = 'OH-IHQ' AND seq_no = 3;

-- Step 2: backfill ajlb_total_landings for book 3 validated flights
-- (trigger protects non-NEW flights; disable for this data correction)
ALTER TABLE flight.logs DISABLE TRIGGER ALL;

WITH cumulative AS (
    SELECT
        l.flight_id,
        ajlb.start_landings + SUM(l.number_of_landings) OVER (
            PARTITION BY l.aircraft_registration, l.ajlb_seq_no
            ORDER BY l.off_block_time_epoch
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS total_landings
    FROM flight.logs l
    JOIN flight.aircraft_journey_log_book ajlb
        ON ajlb.aircraft_registration = l.aircraft_registration
        AND ajlb.seq_no = l.ajlb_seq_no
    WHERE l.aircraft_registration = 'OH-IHQ' AND l.ajlb_seq_no = 3 AND l.status != 'NEW'
)
UPDATE flight.logs
SET ajlb_total_landings = c.total_landings
FROM cumulative c
WHERE flight.logs.flight_id = c.flight_id;

ALTER TABLE flight.logs ENABLE TRIGGER ALL;
