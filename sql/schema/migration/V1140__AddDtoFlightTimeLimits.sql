-- ============================================================
-- V1130 – Add block-time fields to DTO syllabus and flights
-- ============================================================
-- dto.syllabus.min_block_time_mins     — total training gate (hard minimum)
-- dto.syllabus_flights.recommended_block_time_mins — advisory per-exercise
--
-- NULL = not set (backward-compatible default).
-- ============================================================

ALTER TABLE dto.syllabus
    ADD COLUMN min_block_time_mins INTEGER NULL
        CONSTRAINT chk_dto_syllabus_min_block_time
            CHECK (min_block_time_mins IS NULL OR min_block_time_mins > 0);

ALTER TABLE dto.syllabus_flights
    ADD COLUMN recommended_block_time_mins INTEGER NULL
        CONSTRAINT chk_dto_syllabus_flights_recommended_block_time
            CHECK (recommended_block_time_mins IS NULL OR recommended_block_time_mins > 0);
