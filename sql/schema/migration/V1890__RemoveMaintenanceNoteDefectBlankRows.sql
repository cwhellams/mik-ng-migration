-- Product decision: maintenance notes/defects don't need any "blank rows"
-- concept at all -- `rows` (how many physical rows the item's own content
-- occupies) is already enough, and testers can just raise it to leave extra
-- space. Only flights keep a "blank rows before" concept, via the existing
-- ajlb_blank_rows_before column and its logbook UI button -- untouched here.
--
-- Drops blank_rows_after from flight.maintenance_note/flight.defect entirely
-- (added back in V1220/V1223, extended by V1700). The cross-field
-- "zero rows means zero blank" constraints and the original >=0 check on the
-- column itself are dropped automatically with it -- Postgres drops table
-- constraints that reference only the dropped column. The dependent view
-- (flight.vw_ajlb_live_sequence) is repointed first so DROP COLUMN doesn't
-- need CASCADE.

CREATE OR REPLACE VIEW flight.vw_ajlb_live_sequence AS

WITH last_validated AS (
    SELECT DISTINCT ON (aircraft_registration, ajlb_seq_no)
        aircraft_registration,
        ajlb_seq_no,
        ajlb_page_number,
        ajlb_row_number,
        ajlb_total_flight_mins,
        ajlb_total_landings
    FROM flight.logs
    WHERE status != 'NEW'
    ORDER BY aircraft_registration, ajlb_seq_no, on_block_time_epoch DESC
),

baseline AS (
    SELECT
        ajlb.aircraft_registration,
        ajlb.seq_no AS ajlb_seq_no,
        ajlb.start_page,
        ajlb.rows_per_page,
        COALESCE(validated.ajlb_total_flight_mins, ajlb.start_flight_mins, 0) AS baseline_mins,
        COALESCE(validated.ajlb_total_landings, ajlb.start_landings, 0) AS baseline_landings,
        COALESCE(
            validated.ajlb_row_number + (validated.ajlb_page_number - ajlb.start_page) / 2 * ajlb.rows_per_page,
            0
        ) AS baseline_row
    FROM flight.aircraft_journey_log_book AS ajlb
    LEFT JOIN last_validated AS validated
        ON ajlb.aircraft_registration = validated.aircraft_registration
        AND ajlb.seq_no = validated.ajlb_seq_no
),

live_flights AS (
    SELECT
        l.flight_id,
        l.aircraft_registration,
        l.ajlb_seq_no,
        l.off_block_time_epoch,
        b.baseline_mins + SUM(l.flight_mins)
            OVER (PARTITION BY l.aircraft_registration, l.ajlb_seq_no
                  ORDER BY l.off_block_time_epoch, l.flight_id
                  ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS ac_total_flight_mins,
        b.baseline_mins + COALESCE(SUM(l.flight_mins)
            OVER (PARTITION BY l.aircraft_registration, l.ajlb_seq_no
                  ORDER BY l.off_block_time_epoch, l.flight_id
                  ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS starting_flight_mins,
        b.baseline_landings + SUM(l.number_of_landings)
            OVER (PARTITION BY l.aircraft_registration, l.ajlb_seq_no
                  ORDER BY l.off_block_time_epoch, l.flight_id
                  ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS ac_total_landings,
        (l.ajlb_blank_rows_before + 1)::int4 AS rows_consumed
    FROM flight.logs AS l
    JOIN baseline AS b
        ON b.aircraft_registration = l.aircraft_registration AND b.ajlb_seq_no = l.ajlb_seq_no
    WHERE l.status = 'NEW'
),

live_items AS (
    SELECT 'note'::text AS item_type, n.note_id::text AS item_id,
        n.aircraft_registration, n.ajlb_seq_no, n.flight_mins,
        n.rows::int4 AS rows_consumed, n.created_at
    FROM flight.maintenance_note AS n
    JOIN baseline AS b
        ON b.aircraft_registration = n.aircraft_registration AND b.ajlb_seq_no = n.ajlb_seq_no
    WHERE n.rows > 0 AND n.flight_mins >= b.baseline_mins

    UNION ALL

    SELECT 'defect'::text AS item_type, d.defect_id::text AS item_id,
        d.aircraft_registration, d.ajlb_seq_no, d.flight_mins,
        d.rows::int4 AS rows_consumed, d.created_at
    FROM flight.defect AS d
    JOIN baseline AS b
        ON b.aircraft_registration = d.aircraft_registration AND b.ajlb_seq_no = d.ajlb_seq_no
    WHERE d.rows > 0 AND d.flight_mins >= b.baseline_mins
),

anchored_items AS (
    SELECT
        li.item_type,
        li.item_id,
        li.aircraft_registration,
        li.ajlb_seq_no,
        li.flight_mins,
        li.rows_consumed,
        li.created_at,
        b.baseline_mins,
        anchor.flight_id AS anchor_flight_id,
        anchor.off_block_time_epoch AS anchor_epoch
    FROM live_items AS li
    JOIN baseline AS b
        ON b.aircraft_registration = li.aircraft_registration AND b.ajlb_seq_no = li.ajlb_seq_no
    LEFT JOIN LATERAL (
        SELECT lf.flight_id, lf.off_block_time_epoch
        FROM live_flights AS lf
        WHERE lf.aircraft_registration = li.aircraft_registration
            AND lf.ajlb_seq_no = li.ajlb_seq_no
            AND lf.starting_flight_mins < li.flight_mins
            AND lf.ac_total_flight_mins >= li.flight_mins
        ORDER BY lf.off_block_time_epoch, lf.flight_id
        LIMIT 1
    ) AS anchor ON true
),

sequenced AS (
    SELECT
        aircraft_registration,
        ajlb_seq_no,
        'flight'::text AS item_type,
        flight_id::text AS item_id,
        off_block_time_epoch AS sort_epoch,
        flight_id::text AS sort_tiebreak,
        0 AS sort_type_rank,
        NULL::int4 AS sort_flight_mins,
        NULL::timestamptz AS sort_created_at,
        rows_consumed,
        ac_total_flight_mins,
        ac_total_landings,
        NULL::text AS anchor_flight_id
    FROM live_flights

    UNION ALL

    SELECT
        aircraft_registration,
        ajlb_seq_no,
        item_type,
        item_id,
        CASE
            WHEN anchor_epoch IS NOT NULL THEN anchor_epoch
            WHEN flight_mins <= baseline_mins THEN -1::int8
            ELSE 9223372036854775807::int8
        END,
        COALESCE(anchor_flight_id::text, ''),
        1,
        flight_mins,
        created_at,
        rows_consumed,
        NULL::int8,
        NULL::int8,
        anchor_flight_id::text
    FROM anchored_items
)

SELECT
    s.aircraft_registration,
    s.ajlb_seq_no,
    s.item_type,
    s.item_id,
    s.anchor_flight_id,
    s.rows_consumed,
    s.ac_total_flight_mins,
    s.ac_total_landings,
    b.start_page,
    b.rows_per_page,
    b.baseline_row
        + SUM(s.rows_consumed) OVER (
            PARTITION BY s.aircraft_registration, s.ajlb_seq_no
            ORDER BY s.sort_epoch, s.sort_tiebreak, s.sort_type_rank,
                s.sort_flight_mins, s.sort_created_at, s.item_id
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS ajlb_row_number
FROM sequenced AS s
JOIN baseline AS b
    ON b.aircraft_registration = s.aircraft_registration AND b.ajlb_seq_no = s.ajlb_seq_no;


ALTER TABLE flight.maintenance_note
  DROP COLUMN blank_rows_after;

ALTER TABLE flight.defect
  DROP COLUMN blank_rows_after;
