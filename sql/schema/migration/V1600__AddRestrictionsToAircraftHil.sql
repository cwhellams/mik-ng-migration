-- Restrictions describe how a hold item affects operations (e.g. "VFR only, no
-- flight in controlled airspace"). They are entered manually when the HIL entry
-- is created and are the key piece of information other pilots need to see.
ALTER TABLE flight.aircraft_hil
  ADD COLUMN restrictions TEXT NULL;
