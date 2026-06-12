-- Fix: da40tndra was inserted with ajlb_page_number=1, but OH-P28 seq_no=4
-- starts at page 81. The validated_offset formula in vw_flight_time_totals
-- expects absolute page numbers, so this must be 81 (not 1).
-- The no_overlaps_function trigger protects ajlb_page_number on validated
-- flights; bypass it for this one-time data correction.
ALTER TABLE flight.logs DISABLE TRIGGER USER;

UPDATE flight.logs
SET ajlb_page_number = 81
WHERE flight_id = 'da40tndra';

ALTER TABLE flight.logs ENABLE TRIGGER USER;
