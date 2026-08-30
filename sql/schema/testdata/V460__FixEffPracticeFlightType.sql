-- V330__MemberEfficiencyPastData.sql seeded five rows with the pre-#804 value
-- 'PRACTICE', which stopped being a valid schedule.bookings.booking_type or
-- flight.logs.flight_type long ago (see V1090__MigrateBookingTypesToPrivate.sql,
-- which did this exact PRACTICE/CROSSCOUNTRY -> PRIVATE migration for real data).
-- Neither column is a DB enum -- flight_type is a plain VARCHAR(15) -- so nothing
-- caught the stale value at insert time; it only surfaced as an untranslated
-- "flightLog.flightTypes.PRACTICE" in the UI. V330 is already deployed and must
-- not be edited in place, so this corrects the rows it left behind instead.
UPDATE schedule.bookings SET booking_type = 'PRIVATE' WHERE booking_id IN ('eff1', 'eff3', 'eff4');
UPDATE flight.logs SET flight_type = 'PRIVATE' WHERE flight_id IN ('eff1fl', 'eff4fl');
