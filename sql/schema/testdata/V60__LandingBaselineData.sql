-- Seed landing baselines for OH-STL (150) and OH-IHQ (1000)
-- Demonstrates that book 2 inherits accumulated landings from book 1.

INSERT INTO flight.aircraft_landings_baseline
    (aircraft_registration, baseline_landings, created_by, updated_by)
VALUES
    ('OH-STL', 150, 'k1mnimda', 'k1mnimda'),
    ('OH-IHQ', 1000, 'k1mnimda', 'k1mnimda');

-- Step 1: Set first logbook start_landings to baseline
UPDATE flight.aircraft_journey_log_book
SET start_landings = CASE
    WHEN aircraft_registration = 'OH-STL' THEN 150
    WHEN aircraft_registration = 'OH-IHQ' THEN 1000
END
WHERE (aircraft_registration = 'OH-STL' AND seq_no = 1)
   OR (aircraft_registration = 'OH-IHQ' AND seq_no = 1);

-- Step 2: Chain start_landings to second logbooks
-- OH-STL book 2 = 150 + sum of validated landings from book 1
UPDATE flight.aircraft_journey_log_book
SET start_landings = 150 + COALESCE((
    SELECT SUM(l.number_of_landings)
    FROM flight.logs l
    WHERE l.aircraft_registration = 'OH-STL'
      AND l.ajlb_seq_no = 1
      AND l.status != 'NEW'
), 0)
WHERE aircraft_registration = 'OH-STL' AND seq_no = 2;

-- OH-IHQ book 1 has no validated flights, so book 2 start = 1000
UPDATE flight.aircraft_journey_log_book
SET start_landings = 1000
WHERE aircraft_registration = 'OH-IHQ' AND seq_no = 2;

-- Step 3: Recalculate ajlb_total_landings for all non-NEW flights
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
    WHERE l.status != 'NEW'
)
UPDATE flight.logs
SET ajlb_total_landings = c.total_landings
FROM cumulative c
WHERE flight.logs.flight_id = c.flight_id;
