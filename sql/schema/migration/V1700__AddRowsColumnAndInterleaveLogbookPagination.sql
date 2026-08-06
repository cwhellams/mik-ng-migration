-- Issue #1084: maintenance notes / defects were completely invisible to the logbook's
-- row/page numbering, so adding one could push a page past its configured rows_per_page
-- instead of reflowing onto the next page. This migration:
--   1. Adds a `rows` column to flight.maintenance_note and flight.defect: how many rows
--      the item's own content occupies (0 = renders inline on its anchor flight's row,
--      1..n = its own row(s)). blank_rows_after is kept as extra spacer rows after it.
--   2. Introduces flight.vw_ajlb_live_sequence, a shared view that interleaves NEW
--      (not-yet-validated) flights together with notes/defects positioned after the
--      last-validated baseline into one ordered, running row-count sequence.
--      Already-VALIDATED flights keep their frozen ajlb_row_number/ajlb_page_number
--      untouched -- those pages are already "written" and must not move.
--   3. Rewrites vw_flight_logs and vw_flight_time_totals to read from that shared view,
--      so a flight's computed row/page number correctly accounts for any notes/defects
--      anchored before it on the same page.

ALTER TABLE flight.maintenance_note
  ADD COLUMN rows SMALLINT NOT NULL DEFAULT 1;

ALTER TABLE flight.maintenance_note
  ADD CONSTRAINT maintenance_note_rows_check CHECK (rows >= 0);

ALTER TABLE flight.maintenance_note
  ADD CONSTRAINT maintenance_note_zero_rows_no_blank_check
  CHECK (rows > 0 OR blank_rows_after = 0);

-- flight.defect: rendering is currently driven by flight_id IS NOT NULL (inline chip)
-- vs IS NULL (standalone row). Backfill rows=0 for existing flight_id-set rows so the
-- new `rows` column preserves today's rendering instead of flipping every existing
-- in-flight defect into a standalone row.
ALTER TABLE flight.defect
  ADD COLUMN rows SMALLINT NOT NULL DEFAULT 1;

UPDATE flight.defect
  SET rows = 0
  WHERE flight_id IS NOT NULL;

UPDATE flight.defect
  SET blank_rows_after = 0
  WHERE flight_id IS NOT NULL AND blank_rows_after != 0;

ALTER TABLE flight.defect
  ADD CONSTRAINT defect_rows_check CHECK (rows >= 0);

ALTER TABLE flight.defect
  ADD CONSTRAINT defect_zero_rows_no_blank_check
  CHECK (rows > 0 OR blank_rows_after = 0);

-- Shared "live" (unvalidated) row sequence: NEW flights unioned with own-row
-- (rows > 0) notes/defects anchored after the last-validated baseline, ordered by
-- position, with a running row-count window per ajlb.
CREATE VIEW flight.vw_ajlb_live_sequence AS

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

-- NEW-status flights: running totals unaffected by notes/defects (those never add
-- flight time or landings), same shape as the pre-fix vw_flight_logs computation.
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

-- Own-row (rows > 0) notes/defects positioned after the frozen baseline. rows = 0
-- items are inline chips and never consume a page row, so they're excluded entirely.
-- The flight_mins > baseline_mins filter mirrors the write-time guard that rejects
-- creating/editing an item at or before the baseline; kept here too as a defensive
-- backstop so this view stays correct even if that data ever gets out of sync.
live_items AS (
    SELECT 'note'::text AS item_type, n.note_id::text AS item_id,
        n.aircraft_registration, n.ajlb_seq_no, n.flight_mins,
        (n.rows + n.blank_rows_after)::int4 AS rows_consumed, n.created_at
    FROM flight.maintenance_note AS n
    JOIN baseline AS b
        ON b.aircraft_registration = n.aircraft_registration AND b.ajlb_seq_no = n.ajlb_seq_no
    WHERE n.rows > 0 AND n.flight_mins > b.baseline_mins

    UNION ALL

    SELECT 'defect'::text AS item_type, d.defect_id::text AS item_id,
        d.aircraft_registration, d.ajlb_seq_no, d.flight_mins,
        (d.rows + d.blank_rows_after)::int4 AS rows_consumed, d.created_at
    FROM flight.defect AS d
    JOIN baseline AS b
        ON b.aircraft_registration = d.aircraft_registration AND b.ajlb_seq_no = d.ajlb_seq_no
    WHERE d.rows > 0 AND d.flight_mins > b.baseline_mins
),

-- Anchor each item to the first live flight (chronologically) whose cumulative
-- ac_total_flight_mins reaches the item's flight_mins. No match (item posted ahead
-- of every live flight, or there are no live flights yet) => anchor is NULL and the
-- item sorts after every live flight.
anchored_items AS (
    SELECT
        li.item_type,
        li.item_id,
        li.aircraft_registration,
        li.ajlb_seq_no,
        li.flight_mins,
        li.rows_consumed,
        li.created_at,
        anchor.flight_id AS anchor_flight_id,
        anchor.off_block_time_epoch AS anchor_epoch
    FROM live_items AS li
    LEFT JOIN LATERAL (
        SELECT lf.flight_id, lf.off_block_time_epoch
        FROM live_flights AS lf
        WHERE lf.aircraft_registration = li.aircraft_registration
            AND lf.ajlb_seq_no = li.ajlb_seq_no
            AND lf.ac_total_flight_mins >= li.flight_mins
        ORDER BY lf.off_block_time_epoch, lf.flight_id
        LIMIT 1
    ) AS anchor ON true
),

-- One ordered sequence per ajlb: each live flight immediately followed by any items
-- anchored to it. Tie-break: a flight sorts before its own anchored items (both share
-- the same sort_epoch/sort_tiebreak, split apart by sort_type_rank); among items
-- anchored to the same flight, ordered by (flight_mins, created_at); items with no
-- anchor sort after every live flight, ordered among themselves the same way.
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
        COALESCE(anchor_epoch, 9223372036854775807::int8),
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


CREATE OR REPLACE VIEW flight.vw_flight_logs AS

SELECT
    item_id::varchar(9) AS flight_id,
    ac_total_flight_mins::int4,
    format_flight_time(ac_total_flight_mins::int4) AS ac_total_flight_time,
    1 + MOD(ajlb_row_number - 1, rows_per_page)::int4 AS row_number,
    start_page + 2 * ((ajlb_row_number - 1) / rows_per_page)::int4 AS page_number,
    ac_total_landings::int4
FROM flight.vw_ajlb_live_sequence
WHERE item_type = 'flight';


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
        COALESCE(SUM(number_of_landings), 0) AS sum_unverified_landings
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
),

-- min/max row consumed across the whole live sequence (flights + notes + defects),
-- replacing the old flights-only sum_empty_rows/first_empty_rows aggregates.
live_totals AS (
    SELECT aircraft_registration, ajlb_seq_no,
        MIN(ajlb_row_number) AS min_row_number,
        MAX(ajlb_row_number) AS max_row_number
    FROM flight.vw_ajlb_live_sequence
    GROUP BY aircraft_registration, ajlb_seq_no
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

    -- last_page: page of the last row consumed anywhere in the live sequence, falling
    -- back to the baseline (last validated) row when there's no live content yet.
    ajlb.start_page + 2 * FLOOR(GREATEST(
        COALESCE(
            lt.max_row_number,
            COALESCE(
                validated.ajlb_row_number + (validated.ajlb_page_number - ajlb.start_page) / 2 * ajlb.rows_per_page,
                0
            )
        )
        - 1, 0
    )/ajlb.rows_per_page::float)::int4 AS last_page,

    -- new_flights_page: page of the first row of live content (flight, note or
    -- defect -- whichever comes first); falls back to "the next row after baseline"
    -- when there's no live content yet, same semantics as before.
    ajlb.start_page + 2 * FLOOR((
        COALESCE(
            lt.min_row_number,
            COALESCE(
                validated.ajlb_row_number + (validated.ajlb_page_number - ajlb.start_page) / 2 * ajlb.rows_per_page,
                0
            ) + 1
        ) - 1
    )/ajlb.rows_per_page::float)::int4 AS new_flights_page,

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
    AND ajlb.seq_no = vf.ajlb_seq_no
LEFT JOIN live_totals AS lt
    ON ajlb.aircraft_registration = lt.aircraft_registration
    AND ajlb.seq_no = lt.ajlb_seq_no;
