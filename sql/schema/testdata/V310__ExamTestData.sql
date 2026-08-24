-- ============================================================
-- V300 – Exam test data
-- ============================================================
-- Two published exams to exercise both question-ordering modes
-- introduced by #855:
--
--   RNDEXAM01 – "Air Law Quiz (Random Order)"
--     randomize_question_order = true, question_count = 3
--     Each attempt shuffles the 5 authored questions and draws 3.
--
--   FIXEXAM01 – "Aircraft Checklist Quiz (Fixed Order)"
--     randomize_question_order = false, question_count = NULL
--     Each attempt presents all 5 questions in authored sort_order.
-- ============================================================

-- ----------------------------------------------------------------
-- 1. Exams
-- ----------------------------------------------------------------
INSERT INTO exam.exams (
    exam_id, exam_type, name, created_by, updated_by
) VALUES
    ('RNDEXAM01', 'SELF_STUDY', 'Air Law Quiz', 'k1mnimda', 'k1mnimda'),
    ('FIXEXAM01', 'SELF_STUDY', 'Aircraft Checklist Quiz', 'k1mnimda', 'k1mnimda');

-- ----------------------------------------------------------------
-- 2. Exam versions
-- ----------------------------------------------------------------
INSERT INTO exam.exam_versions (
    version_id, exam_id, version_number, status, default_language,
    supported_languages, pass_percent, question_count,
    randomize_question_order, created_by, updated_by
) VALUES
    ('RNDVER001', 'RNDEXAM01', 1, 'PUBLISHED', 'en', '{en}', 75, 3, TRUE, 'k1mnimda', 'k1mnimda'),
    ('FIXVER001', 'FIXEXAM01', 1, 'PUBLISHED', 'en', '{en}', 75, NULL, FALSE, 'k1mnimda', 'k1mnimda');

INSERT INTO exam.exam_version_translations (
    version_id, language, title, description
) VALUES
    ('RNDVER001', 'en', 'Air Law Quiz',
     'Five questions on general air law, drawn 3 at a time in a random order each attempt.'),
    ('FIXVER001', 'en', 'Aircraft Checklist Quiz',
     'Five questions on checklist procedure, always presented in the order below.');

-- ----------------------------------------------------------------
-- 3. Random-order exam: questions & choices
-- ----------------------------------------------------------------
INSERT INTO exam.questions (question_id, version_id, sort_order) VALUES
    ('RNDQ0001', 'RNDVER001', 0),
    ('RNDQ0002', 'RNDVER001', 1),
    ('RNDQ0003', 'RNDVER001', 2),
    ('RNDQ0004', 'RNDVER001', 3),
    ('RNDQ0005', 'RNDVER001', 4);

INSERT INTO exam.question_translations (question_id, language, prompt, reasoning) VALUES
    ('RNDQ0001', 'en', 'What document must a pilot carry to act as PIC of a Finnish-registered aircraft?', 'A valid pilot licence is required to act as PIC.'),
    ('RNDQ0002', 'en', 'Below what altitude is VFR flight generally restricted from flying over congested areas without a specific minimum height?', 'Minimum height rules protect people and property on the ground.'),
    ('RNDQ0003', 'en', 'Who has right of way when two aircraft of the same category are converging at approximately the same altitude?', 'The aircraft to the other''s right has right of way.'),
    ('RNDQ0004', 'en', 'What colour is a VFR sectional chart''s controlled airspace boundary typically depicted in?', 'Controlled airspace boundaries are shown in blue on most VFR charts.'),
    ('RNDQ0005', 'en', 'What is the standard QNH-setting transition altitude in Finland unless otherwise published?', 'Finland uses a nationwide default transition altitude published in the AIP.');

INSERT INTO exam.choices (choice_id, question_id, is_correct, sort_order) VALUES
    ('RNDQ0001A', 'RNDQ0001', TRUE,  0),
    ('RNDQ0001B', 'RNDQ0001', FALSE, 1),
    ('RNDQ0001C', 'RNDQ0001', FALSE, 2),
    ('RNDQ0001D', 'RNDQ0001', FALSE, 3),

    ('RNDQ0002A', 'RNDQ0002', FALSE, 0),
    ('RNDQ0002B', 'RNDQ0002', TRUE,  1),
    ('RNDQ0002C', 'RNDQ0002', FALSE, 2),
    ('RNDQ0002D', 'RNDQ0002', FALSE, 3),

    ('RNDQ0003A', 'RNDQ0003', FALSE, 0),
    ('RNDQ0003B', 'RNDQ0003', FALSE, 1),
    ('RNDQ0003C', 'RNDQ0003', TRUE,  2),
    ('RNDQ0003D', 'RNDQ0003', FALSE, 3),

    ('RNDQ0004A', 'RNDQ0004', TRUE,  0),
    ('RNDQ0004B', 'RNDQ0004', FALSE, 1),
    ('RNDQ0004C', 'RNDQ0004', FALSE, 2),
    ('RNDQ0004D', 'RNDQ0004', FALSE, 3),

    ('RNDQ0005A', 'RNDQ0005', FALSE, 0),
    ('RNDQ0005B', 'RNDQ0005', FALSE, 1),
    ('RNDQ0005C', 'RNDQ0005', FALSE, 2),
    ('RNDQ0005D', 'RNDQ0005', TRUE,  3);

INSERT INTO exam.choice_translations (choice_id, language, text) VALUES
    ('RNDQ0001A', 'en', 'A valid pilot licence with the appropriate rating'),
    ('RNDQ0001B', 'en', 'A passport only'),
    ('RNDQ0001C', 'en', 'A driving licence'),
    ('RNDQ0001D', 'en', 'No document is required'),

    ('RNDQ0002A', 'en', '150 m (500 ft)'),
    ('RNDQ0002B', 'en', '300 m (1000 ft) above the highest obstacle within 600 m'),
    ('RNDQ0002C', 'en', '600 m (2000 ft)'),
    ('RNDQ0002D', 'en', 'There is no minimum height over congested areas'),

    ('RNDQ0003A', 'en', 'The faster aircraft'),
    ('RNDQ0003B', 'en', 'The higher aircraft'),
    ('RNDQ0003C', 'en', 'The aircraft on the other''s right'),
    ('RNDQ0003D', 'en', 'The aircraft on the other''s left'),

    ('RNDQ0004A', 'en', 'Blue'),
    ('RNDQ0004B', 'en', 'Red'),
    ('RNDQ0004C', 'en', 'Green'),
    ('RNDQ0004D', 'en', 'Black'),

    ('RNDQ0005A', 'en', '1000 ft'),
    ('RNDQ0005B', 'en', '3000 ft'),
    ('RNDQ0005C', 'en', '4500 ft'),
    ('RNDQ0005D', 'en', '5000 ft');

-- ----------------------------------------------------------------
-- 4. Fixed-order exam: questions & choices
-- ----------------------------------------------------------------
INSERT INTO exam.questions (question_id, version_id, sort_order) VALUES
    ('FIXQ0001', 'FIXVER001', 0),
    ('FIXQ0002', 'FIXVER001', 1),
    ('FIXQ0003', 'FIXVER001', 2),
    ('FIXQ0004', 'FIXVER001', 3),
    ('FIXQ0005', 'FIXVER001', 4);

INSERT INTO exam.question_translations (question_id, language, prompt, reasoning) VALUES
    ('FIXQ0001', 'en', 'Step 1: Before entering the cockpit, what should be completed first?', 'The exterior/pre-flight walkaround always comes before boarding.'),
    ('FIXQ0002', 'en', 'Step 2: Once seated, what is the first checklist item?', 'Securing the harness comes before touching any controls.'),
    ('FIXQ0003', 'en', 'Step 3: Before starting the engine, what must be confirmed?', 'Area and fuel checks precede engine start for safety.'),
    ('FIXQ0004', 'en', 'Step 4: Immediately after engine start, what is checked first?', 'Oil pressure confirms lubrication before any further checks.'),
    ('FIXQ0005', 'en', 'Step 5: Before taxiing, what is the final check?', 'Flight controls are checked free and correct before movement.');

INSERT INTO exam.choices (choice_id, question_id, is_correct, sort_order) VALUES
    ('FIXQ0001A', 'FIXQ0001', TRUE,  0),
    ('FIXQ0001B', 'FIXQ0001', FALSE, 1),
    ('FIXQ0001C', 'FIXQ0001', FALSE, 2),
    ('FIXQ0001D', 'FIXQ0001', FALSE, 3),

    ('FIXQ0002A', 'FIXQ0002', FALSE, 0),
    ('FIXQ0002B', 'FIXQ0002', TRUE,  1),
    ('FIXQ0002C', 'FIXQ0002', FALSE, 2),
    ('FIXQ0002D', 'FIXQ0002', FALSE, 3),

    ('FIXQ0003A', 'FIXQ0003', FALSE, 0),
    ('FIXQ0003B', 'FIXQ0003', FALSE, 1),
    ('FIXQ0003C', 'FIXQ0003', TRUE,  2),
    ('FIXQ0003D', 'FIXQ0003', FALSE, 3),

    ('FIXQ0004A', 'FIXQ0004', TRUE,  0),
    ('FIXQ0004B', 'FIXQ0004', FALSE, 1),
    ('FIXQ0004C', 'FIXQ0004', FALSE, 2),
    ('FIXQ0004D', 'FIXQ0004', FALSE, 3),

    ('FIXQ0005A', 'FIXQ0005', FALSE, 0),
    ('FIXQ0005B', 'FIXQ0005', FALSE, 1),
    ('FIXQ0005C', 'FIXQ0005', FALSE, 2),
    ('FIXQ0005D', 'FIXQ0005', TRUE,  3);

INSERT INTO exam.choice_translations (choice_id, language, text) VALUES
    ('FIXQ0001A', 'en', 'A complete exterior pre-flight inspection'),
    ('FIXQ0001B', 'en', 'Starting the engine to warm it up'),
    ('FIXQ0001C', 'en', 'Filing the flight plan'),
    ('FIXQ0001D', 'en', 'Requesting taxi clearance'),

    ('FIXQ0002A', 'en', 'Adjusting the radio frequencies'),
    ('FIXQ0002B', 'en', 'Fastening and adjusting the seat harness'),
    ('FIXQ0002C', 'en', 'Setting the altimeter'),
    ('FIXQ0002D', 'en', 'Turning on the avionics'),

    ('FIXQ0003A', 'en', 'That the passengers are briefed'),
    ('FIXQ0003B', 'en', 'That the radio is tuned to the tower'),
    ('FIXQ0003C', 'en', 'That the area is clear and fuel quantity/selector are correct'),
    ('FIXQ0003D', 'en', 'That the transponder code is set'),

    ('FIXQ0004A', 'en', 'Oil pressure rising within limits'),
    ('FIXQ0004B', 'en', 'Fuel flow indication'),
    ('FIXQ0004C', 'en', 'Cylinder head temperature'),
    ('FIXQ0004D', 'en', 'Alternator output'),

    ('FIXQ0005A', 'en', 'Flaps are retracted'),
    ('FIXQ0005B', 'en', 'Trim is set to takeoff'),
    ('FIXQ0005C', 'en', 'Parking brake is released'),
    ('FIXQ0005D', 'en', 'Flight controls are free and correct');
