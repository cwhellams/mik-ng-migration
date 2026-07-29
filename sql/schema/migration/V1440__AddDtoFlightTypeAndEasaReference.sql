-- ============================================================
-- V1440 – Add flight_type classification and EASA FCL reference
-- to dto.syllabus_flights (issues #598, #599)
-- ============================================================
-- flight_type: fixed dropdown classification of the exercise.
--   is_interim_checkpoint already exists as its own boolean column
--   and is intentionally NOT duplicated here.
-- easa_fcl_reference: free-text cross-reference to the relevant
--   EASA FCL syllabus paragraph, no format validation.
-- Both columns are nullable — existing rows are unaffected.
-- ============================================================

CREATE TYPE dto.flight_type AS ENUM ('DUAL', 'SOLO', 'DUAL_XC', 'SOLO_XC');

ALTER TABLE dto.syllabus_flights
    ADD COLUMN flight_type dto.flight_type NULL,
    ADD COLUMN easa_fcl_reference TEXT NULL;

GRANT USAGE ON TYPE dto.flight_type TO ${app_db_user};
