-- ============================================================
-- V2170__AllowNonFixedBaseFuelStations  --  QR codes stuck on a plane, not a pump
-- ============================================================
-- V2060's liquid.fuel_station modelled only pump-mounted codes: a fixed
-- airport, a fixed grade, and (usually) a shared pump. Kanair sells at
-- whichever airport the member happens to be at, so a Kanair QR code goes on
-- the aircraft instead -- it knows the plane and the seller, not a location.
-- Some pumps serve more than one grade too (a piston aircraft that can take
-- either 100LL or MOGAS), so the fuel type has to be equally optional: the
-- member fills in whatever the station does not already know, exactly as they
-- already do for the airport via the "somewhere else" button.
--
-- airport was NOT NULL because every station until now was a fixed pump. A
-- plane-mounted station replaces that with the aircraft, so the shape
-- guarantee moves from "always an airport" to "an airport or a plane" --
-- a station naming neither would resolve to nothing an admin could assign a
-- code to on purpose.

ALTER TABLE liquid.fuel_station ALTER COLUMN airport DROP NOT NULL;

ALTER TABLE liquid.fuel_station ADD CONSTRAINT fuel_station_locates_or_names_chk
    CHECK (airport IS NOT NULL OR aircraft_registration IS NOT NULL);
