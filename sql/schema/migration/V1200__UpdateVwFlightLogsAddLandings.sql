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
                ORDER BY l.off_block_time_epoch)
            ) AS ac_total_flight_mins,

        (COALESCE(validated.ajlb_total_landings, ajlb.start_landings, 0) + SUM(l.number_of_landings)
            OVER (
                PARTITION BY l.aircraft_registration, l.ajlb_seq_no
                ORDER BY l.off_block_time_epoch
                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
            ) AS ac_total_landings,

        COALESCE(validated.ajlb_row_number - 1 + (validated.ajlb_page_number - ajlb.start_page) / 2 * ajlb.rows_per_page, 0)
            + SUM(l.ajlb_blank_rows_before + 1)
            OVER (
                PARTITION BY l.aircraft_registration, l.ajlb_seq_no
                ORDER BY l.off_block_time_epoch
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
