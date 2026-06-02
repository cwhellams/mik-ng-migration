-- Track when a verified DTO flight attempt needs re-verification
-- because the linked flight log was edited after approval.
ALTER TABLE dto.syllabus_flight_attempts
  ADD COLUMN requires_reverification BOOLEAN NOT NULL DEFAULT FALSE;
