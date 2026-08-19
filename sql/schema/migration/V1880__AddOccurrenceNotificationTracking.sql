-- Tracks which status an occurrence was last notified for, so the daily
-- occurrence notification worker only emails processors/managers once per
-- status instead of re-sending the same notification every day it runs
-- while an occurrence sits unprocessed (NEW/ANONYMIZING/ANONYMIZED).
ALTER TABLE flight.occurrences
    ADD COLUMN notified_status public.occurrenceStatus DEFAULT NULL,
    ADD COLUMN notified_at TIMESTAMP DEFAULT NULL;

-- Backfill: mark existing pending occurrences as already notified for their
-- current status, so deploying this migration doesn't itself trigger a
-- one-off re-notification for every occurrence already sitting in
-- NEW/ANONYMIZING/ANONYMIZED at deploy time.
UPDATE flight.occurrences
SET notified_status = status,
    notified_at = CURRENT_TIMESTAMP
WHERE status IN ('NEW', 'ANONYMIZING', 'ANONYMIZED');
