-- Fix: V50 inserted da40tndra with is_billable_flight=TRUE and non_billing_reason=NULL,
-- but existing databases that were migrated before this was corrected still have
-- is_billable_flight=FALSE and non_billing_reason='N/A'.
-- This migration ensures the correct values are present.
UPDATE flight.logs
SET is_billable_flight = TRUE,
    non_billing_reason = NULL
WHERE flight_id = 'da40tndra'
  AND is_billable_flight = FALSE;
