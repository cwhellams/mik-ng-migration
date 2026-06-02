-- ============================================================
-- V212 – Patch DTO seed data with block-time limits/recommendations
-- ============================================================
-- Sets min_block_time_mins on the PPL(A) syllabus (2700 min = 45 h)
-- and recommended_block_time_mins on each flight exercise.
-- Runs after V210__DtoExampleData and V1130__AddDtoFlightTimeLimits.
-- ============================================================

-- Syllabus total minimum: 45 hours
UPDATE dto.syllabus
   SET min_block_time_mins = 2700
 WHERE syllabus_id = 'b0000000-0000-0000-0000-000000000001';

-- Per-flight recommended durations (block time in minutes)
UPDATE dto.syllabus_flights
   SET recommended_block_time_mins = CASE code
       WHEN '01'  THEN  60   -- Basic Handling          1 h
       WHEN '02'  THEN  90   -- Circuit Training        1.5 h
       WHEN '03'  THEN 120   -- Navigation              2 h
       WHEN '04'  THEN  60   -- Emergency Procedures    1 h
       WHEN 'VT'  THEN  60   -- Interim Check           1 h
       WHEN '05'  THEN 150   -- Solo Cross-Country      2.5 h
       WHEN '06'  THEN  90   -- Night Flying            1.5 h
       WHEN '07'  THEN  60   -- Advanced Manoeuvres     1 h
       ELSE NULL
   END
 WHERE syllabus_id = 'b0000000-0000-0000-0000-000000000001';
