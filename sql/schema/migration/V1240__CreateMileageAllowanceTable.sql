-- Mileage allowance rates per tax year, set by the treasurer / accounts admin.
-- Only one row per tax year is allowed (unique constraint on tax_year).
-- Changes are fully audited: created_by, created_at, updated_by, updated_at.

CREATE TABLE accts.mileage_allowance (
    id             SERIAL PRIMARY KEY,
    tax_year       INT          NOT NULL UNIQUE,
    rate_per_km    NUMERIC(6,4) NOT NULL CHECK (rate_per_km > 0),
    discount_pct   NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (discount_pct BETWEEN 0 AND 100),
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by     TEXT         NOT NULL,
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_by     TEXT         NOT NULL
);

COMMENT ON TABLE  accts.mileage_allowance           IS 'Finnish tax-office mileage allowance rates per tax year';
COMMENT ON COLUMN accts.mileage_allowance.rate_per_km  IS 'Official rate €/km as published by the Finnish Tax Administration';
COMMENT ON COLUMN accts.mileage_allowance.discount_pct IS 'Percentage of the official rate that the club actually pays (default 50%)';

-- Seed the 2026 rate (0.55 €/km, club pays 50%)
INSERT INTO accts.mileage_allowance (tax_year, rate_per_km, discount_pct, created_by, updated_by)
VALUES (2026, 0.5500, 50.00, 'system', 'system');
