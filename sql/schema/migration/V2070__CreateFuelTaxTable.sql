-- ============================================================
-- V2070__CreateFuelTaxTable  --  Liquid Management System (#1119)
-- ============================================================
-- Finnish fuel tax per calendar year and fuel type, configured by the treasurer.
-- Modelled on accts.mileage_allowance (V1240), which is the club's existing
-- "one official rate per tax year, fully audited" table.
--
-- Per (year, fuel type) rather than one rate per year: the flexible shape costs
-- nothing and the club's own answer on #1119 asked for it, even though in
-- practice only Jet A-1 carries a rate and every MOGAS grade would share one.
--
-- Deliberately seeded with no rows.  A missing rate means no adjustment, which
-- is the safe default: inventing a rate here would silently move real money
-- through expense claims.  The admin page says so when the table is empty.

CREATE TABLE accts.fuel_tax (
    id                 SERIAL         PRIMARY KEY,
    tax_year           INTEGER        NOT NULL CHECK (tax_year BETWEEN 2000 AND 2200),
    fuel_type          TEXT           NOT NULL REFERENCES flight.fuel_types (name),
    rate_eur_per_litre NUMERIC(10, 4) NOT NULL CHECK (rate_eur_per_litre >= 0),
    created_at         TIMESTAMPTZ    NOT NULL DEFAULT now(),
    created_by         VARCHAR(9)     NOT NULL,
    updated_at         TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_by         VARCHAR(9)     NOT NULL,

    CONSTRAINT fuel_tax_year_type_key UNIQUE (tax_year, fuel_type)
);

COMMENT ON TABLE accts.fuel_tax IS
    'Finnish fuel tax rate per calendar year and fuel type, used by expense-claim and reference-price logic (#1119)';
COMMENT ON COLUMN accts.fuel_tax.rate_eur_per_litre IS
    'EUR per litre added to a purchase that did not already include Finnish fuel tax';
