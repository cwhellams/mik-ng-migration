-- V1035: Set the full set of allowed fuel types for OH-IHQ.
-- V435 seeded OH-IHQ with '{AVGAS,MOGAS}'.  V1030 normalised those values to
-- {100LL, MOGAS 98E5} (two entries).  This migration extends the array to
-- the three correct accepted types and also corrects the ordering to the
-- preferred display order.
UPDATE flight.aircraft
SET fuel_types = ARRAY['MOGAS 98E5', 'MOGAS 95E10', '100LL']::varchar[]
WHERE registration = 'OH-IHQ';
