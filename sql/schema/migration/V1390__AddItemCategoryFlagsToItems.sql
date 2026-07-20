-- Mark invoice items by expense category so they can be offered as suggestions
-- for the corresponding expense claim type (Fuel, Km/Mileage, Other).
ALTER TABLE accts.items
    ADD COLUMN is_fuel_item BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN is_km_item BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN is_other_item BOOLEAN NOT NULL DEFAULT FALSE;
