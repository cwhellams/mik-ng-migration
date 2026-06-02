-- ============================================================
-- V210 – PPL(A) DTO Training example seed data
-- ============================================================
-- Creates a realistic PPL(A) syllabus with two student members who
-- have been assigned the syllabus and have flown several exercises:
--
--   Student 1 – Juha1 (Juha Seppälä, MEMBER)
--     • Flight 01 (Basic Handling):   APPROVED – all items COMPLETED
--     • Flight 02 (Circuit Training): APPROVED – one item MOVED_TO_HIL
--     • Flight 03 (Navigation):       pending (not yet verified)
--     • Interim checkpoint:           NOT yet completed
--
--   Student 2 – Matti1 (Matti Virtanen, FLYING_MEMBER + INSTRUCTOR)
--     • Flight 01 (Basic Handling):   APPROVED – all COMPLETED
--     • Flight 02 (Circuit Training): APPROVED – all COMPLETED
--     • Flight 03 (Navigation):       APPROVED – one item MOVED_TO_HIL
--     • Flight 04 (Emergency Proc.):  APPROVED – all COMPLETED
--     • Flight VT (Interim Check):    APPROVED – interim checkpoint PASSED
--     • Flight 05 (Solo XC):          pending (not yet verified)
--
-- Instructor for all verifications: Jukka1 (INSTRUCTOR)
-- ============================================================

-- ----------------------------------------------------------------
-- 1. Training program
-- ----------------------------------------------------------------
INSERT INTO dto.training_program (
    program_id,
    name,
    description,
    created_by,
    updated_by
) VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'PPL(A) DTO Training',
    'LAPL/PPL(A) Declared Training Organisation training programme.',
    'Liisa1',
    'Liisa1'
);

-- ----------------------------------------------------------------
-- 2. Syllabus version 1.0.0 (PUBLISHED)
-- ----------------------------------------------------------------
INSERT INTO dto.syllabus (
    syllabus_id,
    program_id,
    major_version,
    minor_version,
    patch_version,
    description,
    status,
    published_at,
    created_by,
    updated_by
) VALUES (
    'b0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    1, 0, 0,
    'Full PPL(A) syllabus following EASA DTO requirements. Mobile-friendly field reference.',
    'PUBLISHED',
    '2026-01-01 09:00:00+00',
    'Liisa1',
    'Liisa1'
);

-- ----------------------------------------------------------------
-- 3. Syllabus flights
-- ----------------------------------------------------------------
INSERT INTO dto.syllabus_flights (
    flight_id, syllabus_id, sort_order, code, name, description, tags, is_interim_checkpoint
) VALUES
    -- Flight 01 – Basic Handling
    (
        'c0000000-0000-0000-0000-000000000001',
        'b0000000-0000-0000-0000-000000000001',
        1, '01', 'Basic Handling',
        'Straight & level flight, turns, climbs and descents. Introduction to aircraft controls.',
        '{}', FALSE
    ),
    -- Flight 02 – Circuit Training
    (
        'c0000000-0000-0000-0000-000000000002',
        'b0000000-0000-0000-0000-000000000001',
        2, '02', 'Circuit Training',
        'Normal circuit, stabilised approach, touch & go. Short-field and soft-field techniques.',
        '{}', FALSE
    ),
    -- Flight 03 – Navigation
    (
        'c0000000-0000-0000-0000-000000000003',
        'b0000000-0000-0000-0000-000000000001',
        3, '03', 'Navigation',
        'VFR cross-country navigation using map reading and radio navigation aids.',
        '{"XC"}', FALSE
    ),
    -- Flight 04 – Emergency Procedures
    (
        'c0000000-0000-0000-0000-000000000004',
        'b0000000-0000-0000-0000-000000000001',
        4, '04', 'Emergency Procedures',
        'Simulated engine failures, forced landings, fire drills and emergency communications.',
        '{}', FALSE
    ),
    -- Flight VT – Välitarkastuslento (interim checkpoint)
    (
        'c0000000-0000-0000-0000-000000000005',
        'b0000000-0000-0000-0000-000000000001',
        5, 'VT', 'Välitarkastuslento',
        'Interim checkpoint assessment covering all skills acquired to date.',
        '{}', TRUE
    ),
    -- Flight 05 – Solo Cross-Country
    (
        'c0000000-0000-0000-0000-000000000006',
        'b0000000-0000-0000-0000-000000000001',
        6, '05', 'Solo Cross-Country',
        'First solo cross-country flight with at least one full-stop landing away from home base.',
        '{"SOLO","XC"}', FALSE
    ),
    -- Flight 06 – Night Flying
    (
        'c0000000-0000-0000-0000-000000000007',
        'b0000000-0000-0000-0000-000000000001',
        7, '06', 'Night Flying',
        'Night circuits, night cross-country and night approach procedures.',
        '{"NIGHT"}', FALSE
    ),
    -- Flight 07 – Advanced Maneuvers
    (
        'c0000000-0000-0000-0000-000000000008',
        'b0000000-0000-0000-0000-000000000001',
        8, '07', 'Advanced Manoeuvres',
        'Spin awareness, recovery from unusual attitudes, steep turns.',
        '{}', FALSE
    );

-- ----------------------------------------------------------------
-- 4. Flight items  (2 per flight = 16 total)
-- ----------------------------------------------------------------
INSERT INTO dto.syllabus_flight_items (
    item_id, syllabus_flight_id, sort_order, name, description, mandatory
) VALUES
    -- Flight 01 items
    ('d0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001',1,'Steep turns','360° co-ordinated turns at 45° bank angle.',TRUE),
    ('d0000000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000000001',2,'Lookout technique','Systematic visual scan; HASELL checks before manoeuvres.',TRUE),
    -- Flight 02 items
    ('d0000000-0000-0000-0000-000000000003','c0000000-0000-0000-0000-000000000002',1,'Normal circuit','Consistent circuit geometry, speed management, stabilised approach.',TRUE),
    ('d0000000-0000-0000-0000-000000000004','c0000000-0000-0000-0000-000000000002',2,'Short-field landing','Touch-down on a nominated point; minimum landing roll.',FALSE),
    -- Flight 03 items
    ('d0000000-0000-0000-0000-000000000005','c0000000-0000-0000-0000-000000000003',1,'Map reading','Identify landmarks, maintain planned track ±5 NM.',TRUE),
    ('d0000000-0000-0000-0000-000000000006','c0000000-0000-0000-0000-000000000003',2,'Radio navigation','Use VOR / NDB for track confirmation and position fixing.',TRUE),
    -- Flight 04 items
    ('d0000000-0000-0000-0000-000000000007','c0000000-0000-0000-0000-000000000004',1,'Engine failure simulation','Correct handling: mayday call, best glide, field selection.',TRUE),
    ('d0000000-0000-0000-0000-000000000008','c0000000-0000-0000-0000-000000000004',2,'Forced landing','Plan and execute a forced landing to a suitable field.',TRUE),
    -- Flight VT items
    ('d0000000-0000-0000-0000-000000000009','c0000000-0000-0000-0000-000000000005',1,'Decision making','Demonstrate sound aeronautical decision making under stress.',TRUE),
    ('d0000000-0000-0000-0000-000000000010','c0000000-0000-0000-0000-000000000005',2,'CRM fundamentals','Effective resource management during simulated emergency.',TRUE),
    -- Flight 05 items
    ('d0000000-0000-0000-0000-000000000011','c0000000-0000-0000-0000-000000000006',1,'Flight planning','Complete nav log, fuel check, NOTAM & weather briefing.',TRUE),
    ('d0000000-0000-0000-0000-000000000012','c0000000-0000-0000-0000-000000000006',2,'Fuel management','In-flight fuel monitoring and management.',TRUE),
    -- Flight 06 items
    ('d0000000-0000-0000-0000-000000000013','c0000000-0000-0000-0000-000000000007',1,'Night circuit','Maintain circuit geometry using cockpit lighting only.',TRUE),
    ('d0000000-0000-0000-0000-000000000014','c0000000-0000-0000-0000-000000000007',2,'Night approach & landing','Stabilised approach and landing by reference to runway lighting.',TRUE),
    -- Flight 07 items
    ('d0000000-0000-0000-0000-000000000015','c0000000-0000-0000-0000-000000000008',1,'Spin awareness','Correct entry recognition and recovery using PARE.',TRUE),
    ('d0000000-0000-0000-0000-000000000016','c0000000-0000-0000-0000-000000000008',2,'Unusual attitude recovery','Recovery from nose-high and nose-low unusual attitudes.',FALSE);

-- ----------------------------------------------------------------
-- 5. Member syllabus assignments
-- ----------------------------------------------------------------
INSERT INTO dto.member_syllabus (
    member_syllabus_id, member_id, syllabus_id, is_active, assigned_at, assigned_by
) VALUES
    -- Juha1 – student 1
    (
        'e0000000-0000-0000-0000-000000000001',
        'Juha1',
        'b0000000-0000-0000-0000-000000000001',
        TRUE,
        '2026-01-05 09:00:00+00',
        'Liisa1'
    ),
    -- Matti1 – student 2
    (
        'e0000000-0000-0000-0000-000000000002',
        'Matti1',
        'b0000000-0000-0000-0000-000000000001',
        TRUE,
        '2026-01-03 09:00:00+00',
        'Liisa1'
    );

-- ----------------------------------------------------------------
-- 6. Flight log entries for DTO attempts
-- ----------------------------------------------------------------
-- Aircraft OH-P28 (ajlb_seq_no=4) is shared with V190 instructor test
-- data.  All dates here (2026-01) are after the latest V190 flight
-- (2025-05-05) so the "protected time period" trigger is not violated.
-- flight_id values are 9 chars, starting with "dto" for easy recognition.
--
-- Epoch reference (UTC):
--   2026-01-10 09:00 = 1768039200
--   2026-01-12 09:00 = 1768212000
--   2026-01-17 09:00 = 1768644000
--   2026-01-19 09:00 = 1768816800
--   2026-01-24 09:00 = 1769248800
--   2026-01-26 09:00 = 1769421600
--   2026-02-02 09:00 = 1770026400
--   2026-02-14 09:00 = 1771063200
INSERT INTO flight.logs (
    flight_id,
    billable_member_id,
    pic_member_id,
    pic_last_name,
    pic_role,
    crew2_member_id,
    crew2_last_name,
    crew2_role,
    aircraft_registration,
    off_block_time_epoch,
    takeoff_time_epoch,
    landing_time_epoch,
    on_block_time_epoch,
    oil_uplift_litres,
    fuel_uplift_litres,
    fuel_remaining_litres,
    persons_on_board,
    number_of_landings,
    night_flying_mins,
    instrument_flying_mins,
    departure_airport,
    arrival_airport,
    flight_type,
    billing_remarks,
    personal_remarks,
    created_by,
    updated_by,
    is_billable_flight,
    priv_or_com_flight,
    ajlb_seq_no,
    ajlb_blank_rows_before,
    status,
    is_dto_training_flight
) VALUES
    -- Juha1 – Flight 01 Basic Handling (10 Jan 2026)
    (
        'dtoj1f01a',
        'Juha1', 'Juha1',
        (SELECT last_name FROM member.register WHERE member_id = 'Juha1'),
        'STU',
        'Jukka1',
        (SELECT last_name FROM member.register WHERE member_id = 'Jukka1'),
        'FI',
        'OH-P28',
        1768039200, 1768039800, 1768046400, 1768047000,
        NULL, 20.0, 15.0,
        2, 1, 0, 0,
        'EFHK', 'EFHK', 'SCHOOL', NULL, 'DTO flight 01 – basic handling',
        'Juha1', 'Juha1',
        TRUE, 'C', 4, 0, 'NEW', TRUE
    ),
    -- Juha1 – Flight 02 Circuit Training (17 Jan 2026)
    (
        'dtoj1f02a',
        'Juha1', 'Juha1',
        (SELECT last_name FROM member.register WHERE member_id = 'Juha1'),
        'STU',
        'Jukka1',
        (SELECT last_name FROM member.register WHERE member_id = 'Jukka1'),
        'FI',
        'OH-P28',
        1768644000, 1768644600, 1768651200, 1768651800,
        NULL, 25.0, 12.0,
        2, 4, 0, 0,
        'EFHK', 'EFHK', 'SCHOOL', NULL, 'DTO flight 02 – circuit training',
        'Juha1', 'Juha1',
        TRUE, 'C', 4, 0, 'NEW', TRUE
    ),
    -- Juha1 – Flight 03 Navigation (24 Jan 2026, not yet verified)
    (
        'dtoj1f03a',
        'Juha1', 'Juha1',
        (SELECT last_name FROM member.register WHERE member_id = 'Juha1'),
        'STU',
        'Jukka1',
        (SELECT last_name FROM member.register WHERE member_id = 'Jukka1'),
        'FI',
        'OH-P28',
        1769248800, 1769249400, 1769260800, 1769261400,
        NULL, 35.0, 10.0,
        2, 1, 0, 0,
        'EFHK', 'EFTU', 'SCHOOL', NULL, 'DTO flight 03 – navigation',
        'Juha1', 'Juha1',
        TRUE, 'C', 4, 0, 'NEW', TRUE
    ),
    -- Matti1 – Flight 01 Basic Handling (10 Jan 2026, afternoon)
    (
        'dtom1f01a',
        'Matti1', 'Matti1',
        (SELECT last_name FROM member.register WHERE member_id = 'Matti1'),
        'STU',
        'Jukka1',
        (SELECT last_name FROM member.register WHERE member_id = 'Jukka1'),
        'FI',
        'OH-P28',
        1768057200, 1768057800, 1768064400, 1768065000,
        NULL, 20.0, 15.0,
        2, 1, 0, 0,
        'EFHK', 'EFHK', 'SCHOOL', NULL, 'DTO flight 01 – basic handling',
        'Matti1', 'Matti1',
        TRUE, 'C', 4, 0, 'NEW', TRUE
    ),
    -- Matti1 – Flight 02 Circuit Training (12 Jan 2026)
    (
        'dtom1f02a',
        'Matti1', 'Matti1',
        (SELECT last_name FROM member.register WHERE member_id = 'Matti1'),
        'STU',
        'Jukka1',
        (SELECT last_name FROM member.register WHERE member_id = 'Jukka1'),
        'FI',
        'OH-P28',
        1768212000, 1768212600, 1768219200, 1768219800,
        NULL, 25.0, 12.0,
        2, 5, 0, 0,
        'EFHK', 'EFHK', 'SCHOOL', NULL, 'DTO flight 02 – circuit training',
        'Matti1', 'Matti1',
        TRUE, 'C', 4, 0, 'NEW', TRUE
    ),
    -- Matti1 – Flight 03 Navigation (19 Jan 2026)
    (
        'dtom1f03a',
        'Matti1', 'Matti1',
        (SELECT last_name FROM member.register WHERE member_id = 'Matti1'),
        'STU',
        'Jukka1',
        (SELECT last_name FROM member.register WHERE member_id = 'Jukka1'),
        'FI',
        'OH-P28',
        1768816800, 1768817400, 1768828800, 1768829400,
        NULL, 35.0, 10.0,
        2, 1, 0, 0,
        'EFHK', 'EFTU', 'SCHOOL', NULL, 'DTO flight 03 – navigation',
        'Matti1', 'Matti1',
        TRUE, 'C', 4, 0, 'NEW', TRUE
    ),
    -- Matti1 – Flight 04 Emergency Procedures (26 Jan 2026)
    (
        'dtom1f04a',
        'Matti1', 'Matti1',
        (SELECT last_name FROM member.register WHERE member_id = 'Matti1'),
        'STU',
        'Jukka1',
        (SELECT last_name FROM member.register WHERE member_id = 'Jukka1'),
        'FI',
        'OH-P28',
        1769421600, 1769422200, 1769428800, 1769429400,
        NULL, 20.0, 15.0,
        2, 1, 0, 0,
        'EFHK', 'EFHK', 'SCHOOL', NULL, 'DTO flight 04 – emergency procedures',
        'Matti1', 'Matti1',
        TRUE, 'C', 4, 0, 'NEW', TRUE
    ),
    -- Matti1 – Flight VT Interim Check (2 Feb 2026)
    (
        'dtom1fvta',
        'Matti1', 'Matti1',
        (SELECT last_name FROM member.register WHERE member_id = 'Matti1'),
        'STU',
        'Jukka1',
        (SELECT last_name FROM member.register WHERE member_id = 'Jukka1'),
        'FI',
        'OH-P28',
        1770026400, 1770027000, 1770033600, 1770034200,
        NULL, 20.0, 15.0,
        2, 1, 0, 0,
        'EFHK', 'EFHK', 'SCHOOL', NULL, 'DTO flight VT – välitarkastuslento',
        'Matti1', 'Matti1',
        TRUE, 'C', 4, 0, 'NEW', TRUE
    ),
    -- Matti1 – Flight 05 Solo XC (14 Feb 2026, not yet verified)
    (
        'dtom1f05a',
        'Matti1', 'Matti1',
        (SELECT last_name FROM member.register WHERE member_id = 'Matti1'),
        'STU',
        'Jukka1',
        (SELECT last_name FROM member.register WHERE member_id = 'Jukka1'),
        'FI',
        'OH-P28',
        1771063200, 1771063800, 1771083600, 1771084200,
        NULL, 40.0, 8.0,
        1, 2, 0, 0,
        'EFHK', 'EFTU', 'SCHOOL', NULL, 'DTO flight 05 – solo cross-country',
        'Matti1', 'Matti1',
        TRUE, 'C', 4, 0, 'NEW', TRUE
    );

-- ----------------------------------------------------------------
-- 7. Syllabus flight attempts
-- ----------------------------------------------------------------
INSERT INTO dto.syllabus_flight_attempts (
    attempt_id,
    flight_log_id,
    syllabus_flight_id,
    member_syllabus_id,
    instructor_member_id,
    instructor_comments,
    verification_result,
    verified_at,
    verified_by
) VALUES
    -- Juha1 – 01 Basic Handling: APPROVED
    (
        'f0000000-0000-0000-0000-000000000001',
        'dtoj1f01a',
        'c0000000-0000-0000-0000-000000000001',
        'e0000000-0000-0000-0000-000000000001',
        'Jukka1',
        'Good first lesson. Lookout needs improvement but acceptable.',
        'APPROVED',
        '2026-01-10 14:00:00+00',
        'Jukka1'
    ),
    -- Juha1 – 02 Circuit Training: APPROVED (one HIL item)
    (
        'f0000000-0000-0000-0000-000000000002',
        'dtoj1f02a',
        'c0000000-0000-0000-0000-000000000002',
        'e0000000-0000-0000-0000-000000000001',
        'Jukka1',
        'Circuit shape improving. Short-field technique deferred to HIL for extra practice.',
        'APPROVED',
        '2026-01-17 14:00:00+00',
        'Jukka1'
    ),
    -- Juha1 – 03 Navigation: pending (not yet verified)
    (
        'f0000000-0000-0000-0000-000000000003',
        'dtoj1f03a',
        'c0000000-0000-0000-0000-000000000003',
        'e0000000-0000-0000-0000-000000000001',
        'Jukka1',
        NULL, NULL, NULL, NULL
    ),
    -- Matti1 – 01 Basic Handling: APPROVED
    (
        'f0000000-0000-0000-0000-000000000004',
        'dtom1f01a',
        'c0000000-0000-0000-0000-000000000001',
        'e0000000-0000-0000-0000-000000000002',
        'Jukka1',
        'Excellent control handling for first lesson.',
        'APPROVED',
        '2026-01-10 15:30:00+00',
        'Jukka1'
    ),
    -- Matti1 – 02 Circuit Training: APPROVED
    (
        'f0000000-0000-0000-0000-000000000005',
        'dtom1f02a',
        'c0000000-0000-0000-0000-000000000002',
        'e0000000-0000-0000-0000-000000000002',
        'Jukka1',
        'Consistent circuits. Excellent short-field technique.',
        'APPROVED',
        '2026-01-12 15:30:00+00',
        'Jukka1'
    ),
    -- Matti1 – 03 Navigation: APPROVED (radio nav HIL)
    (
        'f0000000-0000-0000-0000-000000000006',
        'dtom1f03a',
        'c0000000-0000-0000-0000-000000000003',
        'e0000000-0000-0000-0000-000000000002',
        'Jukka1',
        'Good map reading. Radio navigation technique needs more practice – moved to HIL.',
        'APPROVED',
        '2026-01-19 15:30:00+00',
        'Jukka1'
    ),
    -- Matti1 – 04 Emergency Procedures: APPROVED
    (
        'f0000000-0000-0000-0000-000000000007',
        'dtom1f04a',
        'c0000000-0000-0000-0000-000000000004',
        'e0000000-0000-0000-0000-000000000002',
        'Jukka1',
        'Excellent handling of all emergencies. Clear mayday call.',
        'APPROVED',
        '2026-01-26 15:30:00+00',
        'Jukka1'
    ),
    -- Matti1 – VT Interim Check: APPROVED (milestone!)
    (
        'f0000000-0000-0000-0000-000000000008',
        'dtom1fvta',
        'c0000000-0000-0000-0000-000000000005',
        'e0000000-0000-0000-0000-000000000002',
        'Jukka1',
        'Interim checkpoint PASSED. Matti demonstrates sound judgement and good airmanship.',
        'APPROVED',
        '2026-02-02 15:30:00+00',
        'Jukka1'
    ),
    -- Matti1 – 05 Solo XC: pending
    (
        'f0000000-0000-0000-0000-000000000009',
        'dtom1f05a',
        'c0000000-0000-0000-0000-000000000006',
        'e0000000-0000-0000-0000-000000000002',
        'Jukka1',
        NULL, NULL, NULL, NULL
    );

-- ----------------------------------------------------------------
-- 8. Per-item outcomes for verified attempts
-- ----------------------------------------------------------------
INSERT INTO dto.flight_item_outcomes (attempt_id, item_id, outcome, remarks) VALUES
    -- Juha1 attempt 1 (Basic Handling) – both COMPLETED
    ('f0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','COMPLETED', NULL),
    ('f0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000002','COMPLETED', NULL),
    -- Juha1 attempt 2 (Circuit Training) – normal circuit COMPLETED, short-field MOVED_TO_HIL
    ('f0000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000003','COMPLETED', NULL),
    ('f0000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000004','MOVED_TO_HIL','Extra practice needed on short-field technique.'),
    -- Matti1 attempt 1 (Basic Handling) – both COMPLETED
    ('f0000000-0000-0000-0000-000000000004','d0000000-0000-0000-0000-000000000001','COMPLETED', NULL),
    ('f0000000-0000-0000-0000-000000000004','d0000000-0000-0000-0000-000000000002','COMPLETED', NULL),
    -- Matti1 attempt 2 (Circuit Training) – both COMPLETED
    ('f0000000-0000-0000-0000-000000000005','d0000000-0000-0000-0000-000000000003','COMPLETED', NULL),
    ('f0000000-0000-0000-0000-000000000005','d0000000-0000-0000-0000-000000000004','COMPLETED', NULL),
    -- Matti1 attempt 3 (Navigation) – map reading COMPLETED, radio nav MOVED_TO_HIL
    ('f0000000-0000-0000-0000-000000000006','d0000000-0000-0000-0000-000000000005','COMPLETED', NULL),
    ('f0000000-0000-0000-0000-000000000006','d0000000-0000-0000-0000-000000000006','MOVED_TO_HIL','Requires further radio navigation practice.'),
    -- Matti1 attempt 4 (Emergency Procedures) – both COMPLETED
    ('f0000000-0000-0000-0000-000000000007','d0000000-0000-0000-0000-000000000007','COMPLETED', NULL),
    ('f0000000-0000-0000-0000-000000000007','d0000000-0000-0000-0000-000000000008','COMPLETED', NULL),
    -- Matti1 attempt 5 (Interim Check VT) – both COMPLETED
    ('f0000000-0000-0000-0000-000000000008','d0000000-0000-0000-0000-000000000009','COMPLETED', NULL),
    ('f0000000-0000-0000-0000-000000000008','d0000000-0000-0000-0000-000000000010','COMPLETED', NULL);

-- ----------------------------------------------------------------
-- 9. HIL queue entries  (open items pending resolution)
-- ----------------------------------------------------------------
INSERT INTO dto.hil_queue (
    hil_id,
    member_id,
    syllabus_id,
    item_id,
    opened_on_attempt_id,
    opened_at,
    -- resolved_* left NULL  → item is still open
    resolved_on_attempt_id,
    resolved_at,
    resolution_outcome,
    notes
) VALUES
    -- Juha1 – short-field landing moved to HIL in attempt 2
    (
        '10000000-0000-0000-0000-000000000001',
        'Juha1',
        'b0000000-0000-0000-0000-000000000001',
        'd0000000-0000-0000-0000-000000000004',
        'f0000000-0000-0000-0000-000000000002',
        '2026-01-17 14:00:00+00',
        NULL, NULL, NULL,
        'Student to practise short-field technique before next navigation lesson.'
    ),
    -- Matti1 – radio navigation moved to HIL in attempt 3
    (
        '10000000-0000-0000-0000-000000000002',
        'Matti1',
        'b0000000-0000-0000-0000-000000000001',
        'd0000000-0000-0000-0000-000000000006',
        'f0000000-0000-0000-0000-000000000006',
        '2026-01-19 15:30:00+00',
        NULL, NULL, NULL,
        'Additional VOR tracking exercises recommended before solo XC.'
    );
