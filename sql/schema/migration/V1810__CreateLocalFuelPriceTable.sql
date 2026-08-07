-- Structured local (EFNU) fuel price per fuel type, with an effective-from date, so
-- fuel reimbursement can be capped against the price at the time of the trip instead
-- of an admin re-typing a single number into a dialog on every claim (issue #955).
-- Effective-dated (SCD-2 style): the price for a given fuel type on a given date is
-- the most recent row with valid_from <= that date — no explicit valid_to needed.

CREATE TABLE accts.local_fuel_price (
    id                   SERIAL       PRIMARY KEY,
    fuel_type            TEXT         NOT NULL,
    price_eur_per_litre  NUMERIC(8,4) NOT NULL CHECK (price_eur_per_litre > 0),
    valid_from           DATE         NOT NULL,
    created_by           TEXT         NOT NULL REFERENCES member.register(member_id),
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Unique, not just indexed: two rows with the same (fuel_type, valid_from) would make
-- "most recent valid_from <= date" ambiguous and the resulting cap nondeterministic.
-- Re-setting the price for a date already on file is an update of that row instead
-- (see createLocalFuelPrice in db/local-fuel-price-queries.ts).
CREATE UNIQUE INDEX local_fuel_price_type_valid_from_idx ON accts.local_fuel_price (fuel_type, valid_from);

COMMENT ON TABLE  accts.local_fuel_price IS 'Local (EFNU) fuel price cap per fuel type, effective-dated';
COMMENT ON COLUMN accts.local_fuel_price.price_eur_per_litre IS 'Total price including fuel tax, EUR per litre';
COMMENT ON COLUMN accts.local_fuel_price.valid_from IS 'Effective from this date until the next row for the same fuel_type';
