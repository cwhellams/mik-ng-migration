-- Intentionally a no-op.
-- Baseline-triggered AJLB/log landing recalculation runs at runtime when
-- POST /ajlb/:registration/baseline is called (setAircraftLandingsBaseline).
-- This avoids a one-shot Flyway backfill that runs before baseline rows exist.
SELECT 1;
