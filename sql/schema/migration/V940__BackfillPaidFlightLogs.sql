-- Backfill flight logs that are still in INVOICED status but whose invoice is already paid.
-- This corrects data that predates the fix which kept flight.logs in sync when invoices are marked as paid.
UPDATE flight.logs fl
SET
    status = 'PAID',
    updated_at = NOW(),
    updated_by = 'simplbks'
FROM accts.invoice inv
WHERE fl.status = 'INVOICED'
  AND fl.invoice_number = inv.id::varchar
  AND inv.is_paid = true;
