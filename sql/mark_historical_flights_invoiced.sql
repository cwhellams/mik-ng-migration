-- =============================================================================
-- Mark historical flights up to end of February 2026 as INVOICED
-- =============================================================================
-- PURPOSE:
--   The invoicing wizard (getInvoicableFlights) queries only flights with
--   status = 'VALIDATED'. This script advances those flights to 'INVOICED'
--   so they are permanently excluded from future invoice runs.
--
-- SCOPE:
--   - Targets: VALIDATED and QUEUED_FOR_INVOICING flights
--   - Cutoff:  on_block_time_utc < 2026-03-01 (i.e. all flights through Feb 2026)
--   - Skips:   NEW flights (already invisible to the wizard; cannot be set to
--              INVOICED without AJLB values per check_verified_values constraint)
--   - Skips:   INVOICED / PAID flights (already done)
--
-- SAFE TO RUN MULTIPLE TIMES (idempotent — WHERE clause filters already-done rows)
-- =============================================================================

BEGIN;

-- Preview: see what will be updated before committing
-- SELECT flight_id, status, off_block_time_utc, on_block_time_utc
-- FROM flight.logs
-- WHERE status IN ('VALIDATED', 'QUEUED_FOR_INVOICING')
--   AND on_block_time_utc < '2026-03-01 00:00:00+00'
-- ORDER BY on_block_time_utc DESC;

UPDATE flight.logs
SET
    status     = 'INVOICED',
    updated_at = NOW(),
    updated_by = 'admin'
WHERE
    status IN ('VALIDATED', 'QUEUED_FOR_INVOICING')
    AND on_block_time_utc < '2026-03-01 00:00:00+00';

-- Show a summary of rows affected
SELECT
    status,
    COUNT(*)                          AS total_flights,
    MIN(on_block_time_utc)::date      AS earliest_flight,
    MAX(on_block_time_utc)::date      AS latest_flight
FROM flight.logs
WHERE on_block_time_utc < '2026-03-01 00:00:00+00'
GROUP BY status
ORDER BY status;

COMMIT;
