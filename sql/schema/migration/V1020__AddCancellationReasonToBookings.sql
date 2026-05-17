-- Add cancellation reason fields to schedule.bookings
-- Tracks why a booking was cancelled for operational analysis

CREATE TYPE public.cancellation_reason AS ENUM (
    'IM_SAFE_CHECKLIST',
    'AIRCRAFT_TECHNICAL',
    'WEATHER_DEPARTURE',
    'WEATHER_ENROUTE',
    'WEATHER_DESTINATION',
    'PERSONAL_CONFLICT',
    'OTHER',
    'PREFER_NOT_DISCLOSE'
);

GRANT USAGE ON TYPE public.cancellation_reason TO ${app_db_user};

ALTER TABLE schedule.bookings
    ADD COLUMN cancellation_reason public.cancellation_reason,
    ADD COLUMN cancellation_note   TEXT,
    ADD CONSTRAINT bookings_cancellation_note_length_check
        CHECK (cancellation_note IS NULL OR char_length(cancellation_note) <= 500);
