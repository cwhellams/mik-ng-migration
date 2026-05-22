-- Backfill landing data across all logbooks based on aircraft_landings_baseline
-- This migration should only be run after aircraft_landings_baseline has been populated
-- with the appropriate epoch values for each aircraft

-- For each aircraft with a baseline set, calculate and update all logbook start_landings
-- and recalculate all flight ajlb_total_landings

-- Step 1: Update start_landings for the first logbook of each aircraft to match the baseline
WITH first_logbooks AS (
    SELECT DISTINCT ON (aircraft_registration)
        aircraft_registration,
        seq_no
    FROM flight.aircraft_journey_log_book
    ORDER BY aircraft_registration, seq_no ASC
)
UPDATE flight.aircraft_journey_log_book AS ajlb
SET start_landings = baseline.baseline_landings
FROM flight.aircraft_landings_baseline AS baseline,
     first_logbooks AS first
WHERE ajlb.aircraft_registration = baseline.aircraft_registration
    AND ajlb.aircraft_registration = first.aircraft_registration
    AND ajlb.seq_no = first.seq_no;

-- Step 2: Update start_landings for subsequent logbooks based on previous logbook's total
WITH logbook_totals AS (
    SELECT
        aircraft_registration,
        seq_no,
        (
            SELECT COALESCE(SUM(number_of_landings), 0)
            FROM flight.logs l
            WHERE l.aircraft_registration = ajlb.aircraft_registration
                AND l.ajlb_seq_no = ajlb.seq_no
                AND l.status != 'NEW'
        ) AS flights_landings
    FROM flight.aircraft_journey_log_book AS ajlb
),
logbook_sequence AS (
    SELECT
        lt.aircraft_registration,
        lt.seq_no,
        LAG(lt.seq_no) OVER (PARTITION BY lt.aircraft_registration ORDER BY lt.seq_no) AS prev_seq_no,
        lt.flights_landings
    FROM logbook_totals AS lt
),
prev_logbook_totals AS (
    SELECT
        ls.aircraft_registration,
        ls.seq_no,
        COALESCE(ls_prev.start_landings + COALESCE(
            (SELECT SUM(number_of_landings) FROM flight.logs WHERE aircraft_registration = ls.aircraft_registration AND ajlb_seq_no = ls.prev_seq_no AND status != 'NEW'),
            0
        ), 0) AS calculated_start_landings
    FROM logbook_sequence AS ls
    LEFT JOIN flight.aircraft_journey_log_book AS ls_prev
        ON ls.aircraft_registration = ls_prev.aircraft_registration
        AND ls.prev_seq_no = ls_prev.seq_no
    WHERE ls.prev_seq_no IS NOT NULL
)
UPDATE flight.aircraft_journey_log_book AS ajlb
SET start_landings = plt.calculated_start_landings
FROM prev_logbook_totals AS plt
WHERE ajlb.aircraft_registration = plt.aircraft_registration
    AND ajlb.seq_no = plt.seq_no;

-- Step 3: Recalculate ajlb_total_landings for all flights based on updated logbook start_landings
WITH cumulative_landings AS (
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
SET ajlb_total_landings = cl.total_landings
FROM cumulative_landings AS cl
WHERE flight.logs.flight_id = cl.flight_id;
