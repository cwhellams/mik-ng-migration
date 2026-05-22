-- Migrate existing PRACTICE and CROSSCOUNTRY bookings to PRIVATE
-- (must run after V1030 which adds the PRIVATE enum value in a separate transaction)
UPDATE schedule.bookings SET booking_type = 'PRIVATE' WHERE booking_type IN ('PRACTICE', 'CROSSCOUNTRY');
