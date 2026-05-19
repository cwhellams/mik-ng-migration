-- V1025: Create the flight.fuel_types reference table.
-- This replaces the previous enum-based approach.  The table holds every
-- fuel type the club uses; aircraft reference these values as TEXT arrays.
CREATE TABLE flight.fuel_types (
    name       TEXT    PRIMARY KEY,
    sort_order INTEGER NOT NULL DEFAULT 0
);

INSERT INTO flight.fuel_types (name, sort_order) VALUES
    ('JET A',          1),
    ('JET A-1',        2),
    ('JP-8',           3),
    ('100LL',          4),
    ('MOGAS 98E5',     5),
    ('MOGAS 95E10',    6),
    ('EN228 SUPER',    7),
    ('EN228 SUPER PLUS', 8);
