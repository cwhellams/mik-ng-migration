-- Product decision: the "blank rows after" spacer on maintenance notes/defects is
-- replaced by "blank rows before", matching the ajlb_blank_rows_before concept flights
-- already have (V1700). A multi-row item's own rows (rows > 1) already aren't "blank"
-- -- that part is unchanged, only the standalone spacer rows move from after the item's
-- content to before it.
--
-- This only changes in-progress (not-yet-validated) pages: flight.vw_ajlb_live_sequence
-- only ever includes notes/defects at or after the last-validated baseline, so any
-- already-printed/validated page is untouched.

ALTER TABLE flight.maintenance_note
  RENAME COLUMN blank_rows_after TO blank_rows_before;

ALTER TABLE flight.defect
  RENAME COLUMN blank_rows_after TO blank_rows_before;

-- Re-point of flight.vw_ajlb_live_sequence: same row-count math (rows_consumed is
-- still blank_rows_before + rows for an item), but now also carries where within
-- that block the content row sits (content_row_offset), since it's no longer always
-- the block's first row -- it's the first row of the item's own `rows` portion,
-- after the leading blank_rows_before spacer rows.
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
        (l.ajlb_blank_rows_before + 1)::int4 AS rows_consumed,
        NULL::int4 AS content_row_offset
    FROM flight.logs AS l
    JOIN baseline AS b
        ON b.aircraft_registration = l.aircraft_registration AND b.ajlb_seq_no = l.ajlb_seq_no
    WHERE l.status = 'NEW'
),

live_items AS (
    SELECT 'note'::text AS item_type, n.note_id::text AS item_id,
        n.aircraft_registration, n.ajlb_seq_no, n.flight_mins,
        (n.blank_rows_before + n.rows)::int4 AS rows_consumed,
        n.blank_rows_before::int4 AS content_row_offset, n.created_at
    FROM flight.maintenance_note AS n
    JOIN baseline AS b
        ON b.aircraft_registration = n.aircraft_registration AND b.ajlb_seq_no = n.ajlb_seq_no
    WHERE n.rows > 0 AND n.flight_mins >= b.baseline_mins

    UNION ALL

    SELECT 'defect'::text AS item_type, d.defect_id::text AS item_id,
        d.aircraft_registration, d.ajlb_seq_no, d.flight_mins,
        (d.blank_rows_before + d.rows)::int4 AS rows_consumed,
        d.blank_rows_before::int4 AS content_row_offset, d.created_at
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
        li.content_row_offset,
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
        content_row_offset,
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
        content_row_offset,
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
        ) AS ajlb_row_number,
    -- Appended at the end (CREATE OR REPLACE VIEW may only add trailing
    -- columns): the offset within the item's rows_consumed block where its
    -- content row sits, used by vw_ajlb_live_rows below. NULL for flights.
    s.content_row_offset
FROM sequenced AS s
JOIN baseline AS b
    ON b.aircraft_registration = s.aircraft_registration AND b.ajlb_seq_no = s.ajlb_seq_no;


-- Content row is now the first row of the item's own `rows` portion, i.e. at
-- row_offset = content_row_offset (the number of leading blank_rows_before spacer
-- rows), not always row_offset = 0.
CREATE OR REPLACE VIEW flight.vw_ajlb_live_rows AS

SELECT
    s.aircraft_registration,
    s.ajlb_seq_no,
    s.item_type,
    s.item_id,
    gs.row_offset = s.content_row_offset AS is_content_row,
    1 + MOD(s.ajlb_row_number - s.rows_consumed + gs.row_offset, s.rows_per_page)::int4 AS row_number,
    s.start_page
        + 2 * ((s.ajlb_row_number - s.rows_consumed + gs.row_offset) / s.rows_per_page)::int4 AS page_number
FROM flight.vw_ajlb_live_sequence AS s
CROSS JOIN LATERAL generate_series(0, s.rows_consumed - 1) AS gs(row_offset)
WHERE s.item_type != 'flight';
