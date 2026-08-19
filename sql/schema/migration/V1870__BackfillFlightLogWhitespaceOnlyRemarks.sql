-- The trim-on-write contract change (packages/contracts/src/flight-log.ts)
-- means these nullable remarks columns can no longer hold whitespace-only
-- text going forward, but existing rows written before that change may still
-- have some. Backfill them to NULL so:
--   * the incidentsOrObservations list filter can stay a plain
--     `is not null` check instead of evaluating trim() on every row, and
--   * the flight detail view's raw truthy check on incident_or_observations
--     agrees with the list filter for legacy rows.
UPDATE flight.logs
SET billing_remarks = NULL
WHERE billing_remarks IS NOT NULL AND trim(billing_remarks) = '';

UPDATE flight.logs
SET incident_or_observations = NULL
WHERE incident_or_observations IS NOT NULL AND trim(incident_or_observations) = '';

UPDATE flight.logs
SET non_billing_reason = NULL
WHERE non_billing_reason IS NOT NULL AND trim(non_billing_reason) = '';

UPDATE flight.logs
SET min_billable_exception_reason = NULL
WHERE min_billable_exception_reason IS NOT NULL AND trim(min_billable_exception_reason) = '';

UPDATE flight.logs
SET validation_remarks = NULL
WHERE validation_remarks IS NOT NULL AND trim(validation_remarks) = '';

UPDATE flight.logs
SET personal_remarks = NULL
WHERE personal_remarks IS NOT NULL AND trim(personal_remarks) = '';
