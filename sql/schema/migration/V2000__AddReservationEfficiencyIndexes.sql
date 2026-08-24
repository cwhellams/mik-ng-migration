-- Supports the per-member reservation efficiency report (#1174), which matches
-- bookings to flight logs by overlap on the same aircraft rather than by a foreign
-- key: every query in member-efficiency-queries.ts filters flight.logs on
-- aircraft_registration and an off-block/on-block range, and schedule.bookings on
-- member_id and a start/end range.

CREATE INDEX idx_flight_logs_registration_block_times
    ON flight.logs (aircraft_registration, off_block_time_epoch, on_block_time_epoch);

CREATE INDEX idx_bookings_member_id_start_time
    ON schedule.bookings (member_id, start_time_epoch);
