-- Mileage claims move from one route per claim to one or more one-way "legs"
-- per claim (issue #1021) — a round trip is now two legs instead of a single
-- free-text round-trip string. Drop the 1:1 constraint and add structured
-- start/end address + optional waypoints, with the server-computed direct
-- distance kept alongside the actual (possibly manually-overridden) distance
-- so a >20% variance can require a justification note.

ALTER TABLE accts.expense_mileage_detail
    DROP CONSTRAINT expense_mileage_detail_claim_id_key,
    ALTER COLUMN route DROP NOT NULL,
    ADD COLUMN start_address      TEXT NULL,
    ADD COLUMN end_address        TEXT NULL,
    ADD COLUMN start_lat          NUMERIC(9,6) NULL,
    ADD COLUMN start_lon          NUMERIC(9,6) NULL,
    ADD COLUMN end_lat            NUMERIC(9,6) NULL,
    ADD COLUMN end_lon            NUMERIC(9,6) NULL,
    ADD COLUMN waypoints          JSONB NOT NULL DEFAULT '[]',
    ADD COLUMN direct_distance_km NUMERIC(8,2) NULL,
    ADD COLUMN justification_note TEXT NULL;

CREATE INDEX expense_mileage_detail_claim_id_idx ON accts.expense_mileage_detail (claim_id);

COMMENT ON COLUMN accts.expense_mileage_detail.route              IS 'Legacy free-text route, only populated on claims created before issue #1021';
COMMENT ON COLUMN accts.expense_mileage_detail.start_address      IS 'Structured start address label (from geocoding search)';
COMMENT ON COLUMN accts.expense_mileage_detail.end_address        IS 'Structured end address label (from geocoding search)';
COMMENT ON COLUMN accts.expense_mileage_detail.waypoints          IS 'Ordered [{label, lat, lon}, ...] intermediate stops for non-direct routes';
COMMENT ON COLUMN accts.expense_mileage_detail.direct_distance_km IS 'Server-computed start->end distance with no waypoints, for comparison against distance_km';
COMMENT ON COLUMN accts.expense_mileage_detail.justification_note IS 'Required when distance_km exceeds direct_distance_km by more than 20%';
