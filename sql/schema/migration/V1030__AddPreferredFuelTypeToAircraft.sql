-- V1030: Normalise legacy fuel type values in flight.aircraft and add the
-- preferred_fuel_type column.  fuel_types stays as text[]; the valid values
-- are defined in the flight.fuel_types reference table (created in V1025).
--
-- Step 1: Normalise any legacy/old-format values in the fuel_types arrays.
UPDATE flight.aircraft
    SET fuel_types = array_replace(fuel_types, 'JETA-1', 'JET A-1')
    WHERE 'JETA-1' = ANY(fuel_types);

UPDATE flight.aircraft
    SET fuel_types = array_replace(fuel_types, 'AVGAS', '100LL')
    WHERE 'AVGAS' = ANY(fuel_types);

UPDATE flight.aircraft
    SET fuel_types = array_replace(fuel_types, 'MOGAS', 'MOGAS 98E5')
    WHERE 'MOGAS' = ANY(fuel_types);

-- Normalise values that used pre-table short names.
UPDATE flight.aircraft
    SET fuel_types = array_replace(fuel_types, '98E5', 'MOGAS 98E5')
    WHERE '98E5' = ANY(fuel_types);

UPDATE flight.aircraft
    SET fuel_types = array_replace(fuel_types, '95E10', 'MOGAS 95E10')
    WHERE '95E10' = ANY(fuel_types);

-- Normalise hyphenated transitional values.
UPDATE flight.aircraft
    SET fuel_types = array_replace(fuel_types, 'MOGAS-98E5', 'MOGAS 98E5')
    WHERE 'MOGAS-98E5' = ANY(fuel_types);

UPDATE flight.aircraft
    SET fuel_types = array_replace(fuel_types, 'MOGAS-95E10', 'MOGAS 95E10')
    WHERE 'MOGAS-95E10' = ANY(fuel_types);

UPDATE flight.aircraft
    SET fuel_types = array_replace(fuel_types, 'EN228-SUPER', 'EN228 SUPER')
    WHERE 'EN228-SUPER' = ANY(fuel_types);

UPDATE flight.aircraft
    SET fuel_types = array_replace(fuel_types, 'EN228-SUPER-PLUS', 'EN228 SUPER PLUS')
    WHERE 'EN228-SUPER-PLUS' = ANY(fuel_types);

-- Step 2: Add the preferred_fuel_type column as plain TEXT.
ALTER TABLE flight.aircraft
    ADD COLUMN preferred_fuel_type TEXT NULL;

-- Step 3: Enforce that preferred_fuel_type is always one of the allowed fuel
-- types for that aircraft.
ALTER TABLE flight.aircraft
    ADD CONSTRAINT aircraft_preferred_fuel_type_in_fuel_types_chk
    CHECK (preferred_fuel_type IS NULL OR preferred_fuel_type = ANY (fuel_types));
