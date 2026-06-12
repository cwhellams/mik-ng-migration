-- Fix: validated_offset formula used `ajlb_row_number - 1` which converts the 1-based
-- last-validated row to a 0-based index, then adds 1 for each new flight. This places
-- the first NEW flight at the SAME absolute row as the last validated flight, causing
-- overlapping rows (e.g. OH-P28/4 page 81 showed da40tndra + first new flight both at row 1).
-- Fix: use `ajlb_row_number` directly (no -1) so new flights start one position after
-- the last validated flight, not at the same position.
--
-- Same formula appears in vw_flight_time_totals for last_page and new_flights_page
-- and is corrected here too.

CREATE OR REPLACE VIEW flight.vw_flight_logs AS

WITH last_validated AS (
    SELECT DISTINCT ON (aircraft_registration, ajlb_seq_no)
        aircraft_registration,
        ajlb_seq_no,
        on_block_time_utc,
        ajlb_page_number,
        ajlb_row_number,
        ajlb_total_flight_mins,
        ajlb_total_flight_time,
        ajlb_total_landings
    FROM flight.logs
    WHERE status != 'NEW'
    ORDER BY aircraft_registration, ajlb_seq_no, on_block_time_epoch DESC
)

SELECT
    flight_id,
    ac_total_flight_mins::int4,
    format_flight_time(ac_total_flight_mins) AS ac_total_flight_time,
    1 + MOD(ajlb_row_number - 1, rows_per_page)::int4 AS row_number,
    start_page + 2 * ((ajlb_row_number - 1) / rows_per_page)::int4 AS page_number,
    ac_total_landings::int4

FROM (
    SELECT
        l.flight_id,
        ajlb.start_page,

        (COALESCE(validated.ajlb_total_flight_mins, ajlb.start_flight_mins, 0) + SUM(l.flight_mins)
            OVER (
                PARTITION BY l.aircraft_registration, l.ajlb_seq_no
                ORDER BY l.off_block_time_epoch, l.flight_id
                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
            ) AS ac_total_flight_mins,

        (COALESCE(validated.ajlb_total_landings, ajlb.start_landings, 0) + SUM(l.number_of_landings)
            OVER (
                PARTITION BY l.aircraft_registration, l.ajlb_seq_no
                ORDER BY l.off_block_time_epoch, l.flight_id
                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
            ) AS ac_total_landings,

        COALESCE(validated.ajlb_row_number + (validated.ajlb_page_number - ajlb.start_page) / 2 * ajlb.rows_per_page, 0)
            + SUM(l.ajlb_blank_rows_before + 1)
            OVER (
                PARTITION BY l.aircraft_registration, l.ajlb_seq_no
                ORDER BY l.off_block_time_epoch, l.flight_id
                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            ) AS ajlb_row_number,

        ajlb.rows_per_page AS rows_per_page

    FROM flight.logs AS l

    LEFT JOIN flight.aircraft_journey_log_book AS ajlb ON
        ajlb.aircraft_registration = l.aircraft_registration
        AND ajlb.seq_no = l.ajlb_seq_no

    LEFT JOIN last_validated AS validated
        ON l.aircraft_registration = validated.aircraft_registration
        AND l.ajlb_seq_no = validated.ajlb_seq_no

    WHERE l.status = 'NEW'
) sub;


CREATE OR REPLACE VIEW flight.vw_flight_time_totals AS

WITH last_validated AS (
    SELECT DISTINCT ON (aircraft_registration, ajlb_seq_no)
        aircraft_registration,
        ajlb_seq_no,
        on_block_time_utc,
        ajlb_page_number,
        ajlb_row_number,
        ajlb_total_flight_mins,
        ajlb_total_flight_time,
        ajlb_total_landings
    FROM flight.logs
    WHERE status != 'NEW'
    ORDER BY aircraft_registration, ajlb_seq_no, on_block_time_epoch DESC
),

new_flights AS (
    SELECT
        aircraft_registration,
        ajlb_seq_no,
        COALESCE(SUM(flight_mins), 0) AS sum_unverified_mins,
        COUNT(*) AS sum_unverified_flights,
        COALESCE(SUM(number_of_landings), 0) AS sum_unverified_landings,
        SUM(ajlb_blank_rows_before) AS sum_empty_rows,
        (SELECT ajlb_blank_rows_before FROM flight.logs first_new
            WHERE
                first_new.status = 'NEW' AND
                first_new.aircraft_registration = aircraft_registration AND
                first_new.ajlb_seq_no = ajlb_seq_no
            ORDER BY on_block_time_epoch ASC LIMIT 1
        ) AS first_empty_rows
    FROM flight.logs
    WHERE status = 'NEW'
    GROUP BY
        aircraft_registration,
        ajlb_seq_no
),

validated_flights AS (
    SELECT aircraft_registration,
        ajlb_seq_no,
        COALESCE(SUM(flight_mins), 0) AS sum_verified_mins,
        COUNT(*) AS sum_verified_flights
    FROM flight.logs
    WHERE status = 'VALIDATED'
    GROUP BY aircraft_registration,
        ajlb_seq_no
)

SELECT
    ajlb.aircraft_registration,
    ajlb.seq_no AS ajlb_seq_no,
    end_date IS NULL AS current,
    validated.on_block_time_utc AS validated_on_block_time_utc,
    COALESCE(validated.ajlb_total_flight_mins, ajlb.start_flight_mins, 0) AS validated_total_flight_mins,
    format_flight_time(COALESCE(validated.ajlb_total_flight_mins, ajlb.start_flight_mins, 0)) AS verified_total_flight_time,

    format_flight_time(
        COALESCE(validated.ajlb_total_flight_mins, start_flight_mins, 0)
        + COALESCE(nf.sum_unverified_mins, 0)
    ) AS unverified_total_flight_time,

    (COALESCE(validated.ajlb_total_flight_mins, start_flight_mins, 0)
        + COALESCE(nf.sum_unverified_mins, 0))::int4 AS unverified_total_flight_mins,

    ajlb.start_page + 2 * FLOOR(GREATEST(
        COALESCE(
            validated.ajlb_row_number + (validated.ajlb_page_number - ajlb.start_page) / 2 * ajlb.rows_per_page,
            0
        )
        + COALESCE(nf.sum_unverified_flights, 0)
        + COALESCE(nf.sum_empty_rows, 0)
        - 1, 0
    )/ajlb.rows_per_page::float)::int4 AS last_page,

    ajlb.start_page + 2 * FLOOR((
        COALESCE(
            validated.ajlb_row_number + (validated.ajlb_page_number - ajlb.start_page) / 2 * ajlb.rows_per_page,
            0
        )
            + COALESCE(nf.first_empty_rows + 1, 0)
        )/ajlb.rows_per_page::float
    )::int4 AS new_flights_page,

    nf.sum_unverified_flights::int4 AS sum_new_flights,
    format_flight_time(nf.sum_unverified_mins) AS sum_new_time,

    vf.sum_verified_flights::int4 AS sum_validated_flights,
    format_flight_time(vf.sum_verified_mins) AS sum_validated_time,

    COALESCE(validated.ajlb_total_landings, ajlb.start_landings, 0) AS validated_total_landings,

    (COALESCE(validated.ajlb_total_landings, ajlb.start_landings, 0)
        + COALESCE(nf.sum_unverified_landings, 0))::int4 AS total_landings

FROM flight.aircraft_journey_log_book AS ajlb
LEFT JOIN last_validated AS validated
    ON ajlb.aircraft_registration = validated.aircraft_registration
    AND ajlb.seq_no = validated.ajlb_seq_no
LEFT JOIN new_flights AS nf
    ON ajlb.aircraft_registration = nf.aircraft_registration
    AND ajlb.seq_no = nf.ajlb_seq_no
LEFT JOIN validated_flights AS vf
    ON ajlb.aircraft_registration = vf.aircraft_registration
    AND ajlb.seq_no = vf.ajlb_seq_no;
