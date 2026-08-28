-- Issue #1267: a maintenance note recorded AFTER a flight vanished from the flight log
-- the moment the NEXT flight was validated, and came back if that flight was un-validated.
--
-- flight.logs gets its logbook position frozen onto the row when the flight is validated
-- (ajlb_page_number/ajlb_row_number, written by updateFlightLogStatus). Notes and defects
-- never got that treatment, yet flight.vw_ajlb_live_sequence's live_items CTE excluded
-- them once the validated baseline passed their flight_mins -- on the assumption, true
-- only for flights, that anything behind the baseline is already materialised somewhere
-- else. For a note it was materialised nowhere, so it fell out of the live view and out of
-- every backend query built on it: not "off the current page" but invisible everywhere in
-- the logbook. The row itself was never touched, which is why a defect -> note link (which
-- fetches by note_id) kept working, and why un-validating brought the row back.
--
-- This migration gives notes/defects the same freeze flights have:
--   1. ajlb_page_number/ajlb_row_number on flight.maintenance_note and flight.defect --
--      NULL while the item still reflows, set to the physical row its content starts on
--      once the flight it sits on is validated (see updateFlightLogStatus).
--   2. flight.vw_ajlb_frozen_items: frozen items with their absolute row worked back out
--      of (page, row), shared by the three views below.
--   3. flight.vw_ajlb_live_sequence: baseline_row now also clears any frozen note/defect,
--      not just the last validated flight -- a note anchored to that flight is frozen
--      AFTER it, so live content must start past the note's last row, or the next flight
--      would be numbered on top of it.
--   4. flight.vw_ajlb_live_rows: frozen items are unrolled from their persisted position
--      instead of the reflowing sequence, so the logbook page still renders them.
--   5. flight.vw_flight_time_totals: its "no live content yet" fallbacks for last_page /
--      new_flights_page use the same frozen-aware baseline row.
--
-- The live filter is also gone rather than merely amended: an own-row note/defect that is
-- NOT frozen is now always part of the live sequence, whatever its flight_mins. Behind the
-- baseline it sorts to the head of the live region (sequenced's flight_mins <= baseline_mins
-- branch, already there) instead of disappearing. That is what makes the class of bug
-- impossible rather than just this instance of it, and it is what surfaces the notes
-- production has already lost this way -- they come back at the top of the live region,
-- where an admin can correct their time before the next validation freezes them.
-- Deliberately no backfill: a note's true historical page cannot be reconstructed, since
-- every row on those pages is already frozen to a flight and nothing can be inserted
-- between them without renumbering a page that is physically written.

ALTER TABLE flight.maintenance_note
  ADD COLUMN ajlb_page_number INT4,
  ADD COLUMN ajlb_row_number INT4;

-- Both or neither: half a position is not a position, and every reader derives the
-- absolute row from the pair.
ALTER TABLE flight.maintenance_note
  ADD CONSTRAINT maintenance_note_ajlb_position_check
  CHECK ((ajlb_page_number IS NULL) = (ajlb_row_number IS NULL));

-- Only own-row items occupy a physical row, so only they can hold one.
ALTER TABLE flight.maintenance_note
  ADD CONSTRAINT maintenance_note_frozen_rows_check
  CHECK (ajlb_page_number IS NULL OR rows > 0);

ALTER TABLE flight.defect
  ADD COLUMN ajlb_page_number INT4,
  ADD COLUMN ajlb_row_number INT4;

ALTER TABLE flight.defect
  ADD CONSTRAINT defect_ajlb_position_check
  CHECK ((ajlb_page_number IS NULL) = (ajlb_row_number IS NULL));

ALTER TABLE flight.defect
  ADD CONSTRAINT defect_frozen_rows_check
  CHECK (ajlb_page_number IS NULL OR rows > 0);


-- Own-row notes/defects whose position has been frozen onto the row. ajlb_row_number is
-- per-page (1..rows_per_page) exactly as on flight.logs, so ajlb_last_row rebuilds the
-- absolute row index of the item's LAST row the same way flight.vw_ajlb_live_sequence's
-- baseline rebuilds a validated flight's: per-page row + whole pages elapsed, pages
-- stepping by 2 because a logbook page is a left/right spread.
CREATE VIEW flight.vw_ajlb_frozen_items AS

SELECT
    n.aircraft_registration,
    n.ajlb_seq_no,
    'note'::text AS item_type,
    n.note_id::text AS item_id,
    n.rows::int4 AS rows_consumed,
    n.ajlb_page_number,
    n.ajlb_row_number,
    ajlb.rows_per_page,
    (n.ajlb_row_number
        + (n.ajlb_page_number - ajlb.start_page) / 2 * ajlb.rows_per_page
        + n.rows - 1)::int4 AS ajlb_last_row
FROM flight.maintenance_note AS n
JOIN flight.aircraft_journey_log_book AS ajlb
    ON ajlb.aircraft_registration = n.aircraft_registration
    AND ajlb.seq_no = n.ajlb_seq_no
WHERE n.rows > 0 AND n.ajlb_page_number IS NOT NULL

UNION ALL

SELECT
    d.aircraft_registration,
    d.ajlb_seq_no,
    'defect'::text AS item_type,
    d.defect_id::text AS item_id,
    d.rows::int4 AS rows_consumed,
    d.ajlb_page_number,
    d.ajlb_row_number,
    ajlb.rows_per_page,
    (d.ajlb_row_number
        + (d.ajlb_page_number - ajlb.start_page) / 2 * ajlb.rows_per_page
        + d.rows - 1)::int4 AS ajlb_last_row
FROM flight.defect AS d
JOIN flight.aircraft_journey_log_book AS ajlb
    ON ajlb.aircraft_registration = d.aircraft_registration
    AND ajlb.seq_no = d.ajlb_seq_no
WHERE d.rows > 0 AND d.ajlb_page_number IS NOT NULL;


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

-- The last row any frozen note/defect occupies. Part of the baseline for the same reason
-- the last validated flight's row is: it is written on paper and live content must start
-- after it. It can sit past that flight's row -- an item anchored to a flight is frozen
-- immediately after it -- which is why this is a GREATEST and not a COALESCE.
frozen_rows AS (
    SELECT
        aircraft_registration,
        ajlb_seq_no,
        MAX(ajlb_last_row) AS max_frozen_row
    FROM flight.vw_ajlb_frozen_items
    GROUP BY aircraft_registration, ajlb_seq_no
),

baseline AS (
    SELECT
        ajlb.aircraft_registration,
        ajlb.seq_no AS ajlb_seq_no,
        ajlb.start_page,
        ajlb.rows_per_page,
        COALESCE(validated.ajlb_total_flight_mins, ajlb.start_flight_mins, 0) AS baseline_mins,
        COALESCE(validated.ajlb_total_landings, ajlb.start_landings, 0) AS baseline_landings,
        GREATEST(
            COALESCE(
                validated.ajlb_row_number + (validated.ajlb_page_number - ajlb.start_page) / 2 * ajlb.rows_per_page,
                0
            ),
            COALESCE(frozen.max_frozen_row, 0)
        ) AS baseline_row
    FROM flight.aircraft_journey_log_book AS ajlb
    LEFT JOIN last_validated AS validated
        ON ajlb.aircraft_registration = validated.aircraft_registration
        AND ajlb.seq_no = validated.ajlb_seq_no
    LEFT JOIN frozen_rows AS frozen
        ON ajlb.aircraft_registration = frozen.aircraft_registration
        AND ajlb.seq_no = frozen.ajlb_seq_no
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

-- Own-row (rows > 0) notes/defects that are NOT yet frozen -- i.e. everything the live
-- region still gets to place. rows = 0 items are inline chips (only ever in-flight
-- defects) and never consume a page row, so they stay excluded.
--
-- Note what is NOT here: a flight_mins >= baseline_mins filter. That filter was #1267 --
-- an item behind the baseline with nowhere else to live simply disappeared. An unfrozen
-- item is always in the sequence now; if its checkpoint is at or behind the baseline it
-- sorts to the head of the live region (see sequenced below), which is the closest true
-- position available and, above all, visible.
live_items AS (
    SELECT 'note'::text AS item_type, n.note_id::text AS item_id,
        n.aircraft_registration, n.ajlb_seq_no, n.flight_mins,
        n.rows::int4 AS rows_consumed, n.created_at
    FROM flight.maintenance_note AS n
    JOIN baseline AS b
        ON b.aircraft_registration = n.aircraft_registration AND b.ajlb_seq_no = n.ajlb_seq_no
    WHERE n.rows > 0 AND n.ajlb_page_number IS NULL

    UNION ALL

    SELECT 'defect'::text AS item_type, d.defect_id::text AS item_id,
        d.aircraft_registration, d.ajlb_seq_no, d.flight_mins,
        d.rows::int4 AS rows_consumed, d.created_at
    FROM flight.defect AS d
    JOIN baseline AS b
        ON b.aircraft_registration = d.aircraft_registration AND b.ajlb_seq_no = d.ajlb_seq_no
    WHERE d.rows > 0 AND d.ajlb_page_number IS NULL
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


-- Per-physical-row breakdown of own-row (rows > 0) notes/defects, unchanged in shape and
-- meaning: one row per physical logbook line the item occupies. What is new is the second
-- branch -- a frozen item is unrolled from the position written on its row, never from the
-- live sequence, because that position must not move again.
CREATE OR REPLACE VIEW flight.vw_ajlb_live_rows AS

SELECT
    s.aircraft_registration,
    s.ajlb_seq_no,
    s.item_type,
    s.item_id,
    gs.row_offset = 0 AS is_content_row,
    1 + MOD(s.ajlb_row_number - s.rows_consumed + gs.row_offset, s.rows_per_page)::int4 AS row_number,
    s.start_page
        + 2 * ((s.ajlb_row_number - s.rows_consumed + gs.row_offset) / s.rows_per_page)::int4 AS page_number
FROM flight.vw_ajlb_live_sequence AS s
CROSS JOIN LATERAL generate_series(0, s.rows_consumed - 1) AS gs(row_offset)
WHERE s.item_type != 'flight'

UNION ALL

-- Frozen items unroll from (page, row) directly: an item whose rows spill over the end of
-- its page carries onto the next spread, exactly as the live branch above does, so no
-- absolute row index -- and therefore no dependency on start_page still matching -- is
-- needed here.
SELECT
    f.aircraft_registration,
    f.ajlb_seq_no,
    f.item_type,
    f.item_id,
    gs.row_offset = 0 AS is_content_row,
    1 + MOD(f.ajlb_row_number - 1 + gs.row_offset, f.rows_per_page)::int4 AS row_number,
    f.ajlb_page_number
        + 2 * ((f.ajlb_row_number - 1 + gs.row_offset) / f.rows_per_page)::int4 AS page_number
FROM flight.vw_ajlb_frozen_items AS f
CROSS JOIN LATERAL generate_series(0, f.rows_consumed - 1) AS gs(row_offset);


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
),

-- Frozen notes/defects can outrun the last validated flight's row (an item anchored to it
-- is frozen just after it), so the "nothing live yet" fallbacks below have to clear them
-- too -- same GREATEST as flight.vw_ajlb_live_sequence's baseline_row.
frozen_totals AS (
    SELECT aircraft_registration, ajlb_seq_no,
        MAX(ajlb_last_row) AS max_frozen_row
    FROM flight.vw_ajlb_frozen_items
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
    -- back to the baseline (last validated flight, or a frozen note/defect past it) when
    -- there's no live content yet.
    ajlb.start_page + 2 * FLOOR(GREATEST(
        COALESCE(
            lt.max_row_number,
            GREATEST(
                COALESCE(
                    validated.ajlb_row_number + (validated.ajlb_page_number - ajlb.start_page) / 2 * ajlb.rows_per_page,
                    0
                ),
                COALESCE(ft.max_frozen_row, 0)
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
            GREATEST(
                COALESCE(
                    validated.ajlb_row_number + (validated.ajlb_page_number - ajlb.start_page) / 2 * ajlb.rows_per_page,
                    0
                ),
                COALESCE(ft.max_frozen_row, 0)
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
    AND ajlb.seq_no = lt.ajlb_seq_no
LEFT JOIN frozen_totals AS ft
    ON ajlb.aircraft_registration = ft.aircraft_registration
    AND ajlb.seq_no = ft.ajlb_seq_no;
