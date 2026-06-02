-- ============================================================
-- V215 – Night Flying DTO Qualification seed data
-- ============================================================
-- Creates a standalone Night Flying (NR) training programme with
-- two syllabus versions and three new student members:
--
--   Student 1 – Risto1 (Risto Järvinen) – assigned syllabus v1.0.0
--     • N01 Night Familiarisation:   APPROVED (all 11 items completed)
--     • N02 Night Circuits:          APPROVED (11 completed, 2 HIL)
--     • N03 Night Navigation:        APPROVED (10 completed, 2 HIL)
--     • N04 Solo Night Circuits:     pending (not yet verified)
--
--   Student 2 – Pirjo1 (Pirjo Mäkelä) – assigned syllabus v1.0.0
--     • N01 Night Familiarisation:   APPROVED (all 11 items completed)
--     • N02 Night Circuits:          pending (not yet verified)
--
--   Student 3 – Teemu1 (Teemu Kinnunen) – assigned syllabus v2.0.0
--     • N01 Night Familiarisation:   APPROVED (11 completed, 1 HIL)
--
-- Syllabus v1.0.0: 6 flights, 11–13 items each (70 total)
-- Syllabus v2.0.0: 6 flights, 11–14 items each (73 total), revised content
-- Instructor for all verifications: Jukka1
-- Min block time: v1 = 360 min (6 h), v2 = 420 min (7 h)
-- ============================================================

-- ----------------------------------------------------------------
-- 1. New members
-- ----------------------------------------------------------------
INSERT INTO member.register (
    member_id,
    first_name,
    last_name,
    date_of_birth,
    member_since,
    email,
    phone_number,
    ice_contact_name,
    ice_contact_phone_number,
    member_type,
    billing_id,
    street_address,
    town_city,
    postcode,
    can_make_reservations,
    is_training_program_pilot,
    created_by,
    updated_by,
    licence_id,
    licence_expiry_date,
    medical_expiry_date
) VALUES
    (
        'Risto1',
        'Risto',
        'Järvinen',
        '1991-04-12',
        current_date,
        'risto.jarvinen@example.com',
        '0451234001',
        'Hanna Järvinen',
        '0459876001',
        'FLYING',
        '501',
        'Katajanokka 3',
        'Helsinki',
        '00160',
        TRUE,
        TRUE,
        'k1mnimda',
        'k1mnimda',
        'FI.FCL.501001',
        '2027-06-01',
        '2027-06-01'
    ),
    (
        'Pirjo1',
        'Pirjo',
        'Mäkelä',
        '1988-09-23',
        current_date,
        'pirjo.makela@example.com',
        '0451234002',
        'Tauno Mäkelä',
        '0459876002',
        'FLYING',
        '502',
        'Töölönkatu 14',
        'Helsinki',
        '00260',
        TRUE,
        TRUE,
        'k1mnimda',
        'k1mnimda',
        'FI.FCL.502001',
        '2027-06-01',
        '2027-06-01'
    ),
    (
        'Teemu1',
        'Teemu',
        'Kinnunen',
        '1994-02-07',
        current_date,
        'teemu.kinnunen@example.com',
        '0451234003',
        'Leena Kinnunen',
        '0459876003',
        'FLYING',
        '503',
        'Punavuorenkatu 8',
        'Helsinki',
        '00120',
        TRUE,
        TRUE,
        'k1mnimda',
        'k1mnimda',
        'FI.FCL.503001',
        '2027-06-01',
        '2027-06-01'
    );

-- Approve new members
UPDATE member.register
   SET membership_approved_at = current_timestamp,
       membership_approved_by = 'Liisa1',
       email_verified_at = current_timestamp
 WHERE member_id IN ('Risto1', 'Pirjo1', 'Teemu1');

-- ----------------------------------------------------------------
-- 2. Member roles  (MEMBER → inherits dto.user from V1120 migration)
-- ----------------------------------------------------------------
INSERT INTO member.member_to_roles (member_id, role_id, created_by)
VALUES
    ('Risto1', 'MEMBER', 'k1mnimda'),
    ('Pirjo1', 'MEMBER', 'k1mnimda'),
    ('Teemu1', 'MEMBER', 'k1mnimda');

-- ----------------------------------------------------------------
-- 3. Night Flying training programme
-- ----------------------------------------------------------------
INSERT INTO dto.training_program (
    program_id,
    name,
    description,
    created_by,
    updated_by
) VALUES (
    'a0000000-0000-0000-0000-000000000002',
    'Night Flying Qualification',
    'EASA Part-FCL Night Rating (NR) training programme. Minimum 5 hours night flight time of which at least 3 hours dual instruction.',
    'Liisa1',
    'Liisa1'
);

-- ----------------------------------------------------------------
-- 4a. Syllabus v1.0.0 (PUBLISHED)
-- ----------------------------------------------------------------
INSERT INTO dto.syllabus (
    syllabus_id,
    program_id,
    major_version,
    minor_version,
    patch_version,
    description,
    min_block_time_mins,
    status,
    published_at,
    created_by,
    updated_by
) VALUES (
    'b0000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000002',
    1, 0, 0,
    'Night Rating syllabus v1 — covers all EASA Part-FCL NR requirements. Minimum 6 flight hours.',
    360,
    'PUBLISHED',
    '2026-01-15 09:00:00+00',
    'Liisa1',
    'Liisa1'
);

-- ----------------------------------------------------------------
-- 4b. Syllabus v1 flights
-- ----------------------------------------------------------------
INSERT INTO dto.syllabus_flights (
    flight_id, syllabus_id, sort_order, code, name, description,
    tags, is_interim_checkpoint, recommended_block_time_mins
) VALUES
    (
        'c0000000-0000-0000-0000-000000000101',
        'b0000000-0000-0000-0000-000000000002',
        1, 'N01', 'Night Familiarisation',
        'Introduction to the night environment: aircraft lighting, aerodrome lighting, night-adapted vision and cockpit management.',
        '{"NIGHT"}', FALSE, 90
    ),
    (
        'c0000000-0000-0000-0000-000000000102',
        'b0000000-0000-0000-0000-000000000002',
        2, 'N02', 'Night Circuits',
        'Night circuit flying with instructor: normal circuits, PAPI use, go-arounds and engine-failure drills.',
        '{"NIGHT"}', FALSE, 90
    ),
    (
        'c0000000-0000-0000-0000-000000000103',
        'b0000000-0000-0000-0000-000000000002',
        3, 'N03', 'Night Navigation',
        'VFR night navigation using visual landmarks, radio navigation aids and dead reckoning. Night diversion exercise.',
        '{"NIGHT","XC"}', FALSE, 120
    ),
    (
        'c0000000-0000-0000-0000-000000000104',
        'b0000000-0000-0000-0000-000000000002',
        4, 'N04', 'Solo Night Circuits',
        'Minimum five solo take-offs and five full-stop night landings. Student operates independently.',
        '{"NIGHT","SOLO"}', FALSE, 60
    ),
    (
        'c0000000-0000-0000-0000-000000000105',
        'b0000000-0000-0000-0000-000000000002',
        5, 'N05', 'Night Cross-Country',
        'Solo or dual night cross-country of at least 27 NM with a full-stop landing at a destination aerodrome.',
        '{"NIGHT","SOLO","XC"}', FALSE, 150
    ),
    (
        'c0000000-0000-0000-0000-000000000106',
        'b0000000-0000-0000-0000-000000000002',
        6, 'N06', 'Night Rating Skill Test',
        'Skill test with an examiner covering all Night Rating competencies.',
        '{"NIGHT"}', FALSE, 90
    );

-- ----------------------------------------------------------------
-- 4c. Syllabus v1 flight items  (70 items total)
-- ----------------------------------------------------------------
INSERT INTO dto.syllabus_flight_items (
    item_id, syllabus_flight_id, sort_order, name, description, mandatory
) VALUES
    -- N01 Night Familiarisation – 11 items
    ('d0000000-0000-0000-0000-000000000101','c0000000-0000-0000-0000-000000000101', 1,'Aircraft lighting systems check','Verify and operate nav/position lights, landing light, anti-collision beacon and cockpit lighting.',TRUE),
    ('d0000000-0000-0000-0000-000000000102','c0000000-0000-0000-0000-000000000101', 2,'Aerodrome lighting interpretation','Identify runway edge lights, threshold lights, PAPI/VASIS, taxiway centreline and stop bars.',TRUE),
    ('d0000000-0000-0000-0000-000000000103','c0000000-0000-0000-0000-000000000101', 3,'Night-adapted vision techniques','Use peripheral (off-centre) vision and allow adequate dark adaptation before flight.',TRUE),
    ('d0000000-0000-0000-0000-000000000104','c0000000-0000-0000-0000-000000000101', 4,'Cockpit lighting management','Set instrument and chart lighting to minimise glare without compromising outside lookout.',TRUE),
    ('d0000000-0000-0000-0000-000000000105','c0000000-0000-0000-0000-000000000101', 5,'Spatial disorientation prevention','Recognise and manage leans, graveyard spiral tendencies and other vestibular illusions at night.',TRUE),
    ('d0000000-0000-0000-0000-000000000106','c0000000-0000-0000-0000-000000000101', 6,'Night visual illusions','Understand black-hole approach effect, terrain slope illusion and featureless terrain at night.',TRUE),
    ('d0000000-0000-0000-0000-000000000107','c0000000-0000-0000-0000-000000000101', 7,'Night meteorology assessment','Identify developing weather at night, assess visibility using ground lighting and moon illumination.',TRUE),
    ('d0000000-0000-0000-0000-000000000108','c0000000-0000-0000-0000-000000000101', 8,'Emergency lighting and equipment','Know location and use of backup torch, emergency equipment and passenger lighting.',TRUE),
    ('d0000000-0000-0000-0000-000000000109','c0000000-0000-0000-0000-000000000101', 9,'ATC light signals at night','Correctly interpret and respond to light signals from tower when radio fails.',TRUE),
    ('d0000000-0000-0000-0000-000000000110','c0000000-0000-0000-0000-000000000101',10,'Night taxiing technique','Follow taxiway lighting at safe speed; hold at lit stop bars; use taxi clearance and airport diagram.',TRUE),
    ('d0000000-0000-0000-0000-000000000111','c0000000-0000-0000-0000-000000000101',11,'Navigation lights verification','Confirm aircraft navigation lights are visible to other traffic; report any inoperative lights.',FALSE),

    -- N02 Night Circuits – 13 items
    ('d0000000-0000-0000-0000-000000000112','c0000000-0000-0000-0000-000000000102', 1,'Pre-takeoff night lighting check','Final check of all external lights before entering runway at night.',TRUE),
    ('d0000000-0000-0000-0000-000000000113','c0000000-0000-0000-0000-000000000102', 2,'Night runway environment assessment','Identify runway end, displaced threshold, touchdown zone and overrun area from the hold.',TRUE),
    ('d0000000-0000-0000-0000-000000000114','c0000000-0000-0000-0000-000000000102', 3,'Normal night circuit','Maintain correct circuit height and position using altimeter and drift angle; look for other traffic.',TRUE),
    ('d0000000-0000-0000-0000-000000000115','c0000000-0000-0000-0000-000000000102', 4,'PAPI/VASIS interpretation at night','Use glide-slope lighting to maintain correct approach path; correct for above/below indications.',TRUE),
    ('d0000000-0000-0000-0000-000000000116','c0000000-0000-0000-0000-000000000102', 5,'Stabilised night approach','Maintain stable speed and rate of descent from 500 ft AGL to threshold.',TRUE),
    ('d0000000-0000-0000-0000-000000000117','c0000000-0000-0000-0000-000000000102', 6,'Night landing flare and touchdown','Judge flare height over threshold using peripheral vision; achieve smooth touchdown in zone.',TRUE),
    ('d0000000-0000-0000-0000-000000000118','c0000000-0000-0000-0000-000000000102', 7,'Landing light management','Deploy and retract landing light correctly; understand dazzle effect on wet runways.',TRUE),
    ('d0000000-0000-0000-0000-000000000119','c0000000-0000-0000-0000-000000000102', 8,'Touch-and-go at night','Execute clean touch-and-go; reconfigure aircraft during roll without loss of runway awareness.',TRUE),
    ('d0000000-0000-0000-0000-000000000120','c0000000-0000-0000-0000-000000000102', 9,'Go-around at night','Apply full power, set attitude, retract flap in stages; maintain runway centreline during initial climb.',TRUE),
    ('d0000000-0000-0000-0000-000000000121','c0000000-0000-0000-0000-000000000102',10,'Engine failure on departure at night','Correct decision to land ahead or return; squawk 7700; mayday call; forced landing technique.',TRUE),
    ('d0000000-0000-0000-0000-000000000122','c0000000-0000-0000-0000-000000000102',11,'Runway incursion awareness','Identify hot spots and holding positions; LAHSO awareness; scan for movement on runway before entering.',TRUE),
    ('d0000000-0000-0000-0000-000000000123','c0000000-0000-0000-0000-000000000102',12,'Crosswind circuit at night','Maintain drift correction on crosswind and base legs; judge crab angle on approach.',FALSE),
    ('d0000000-0000-0000-0000-000000000124','c0000000-0000-0000-0000-000000000102',13,'Short-field landing at night','Achieve touchdown before nominated point; full flap; firm braking; maintain runway awareness.',FALSE),

    -- N03 Night Navigation – 12 items
    ('d0000000-0000-0000-0000-000000000125','c0000000-0000-0000-0000-000000000103', 1,'Night pre-flight planning','Complete nav log; select route avoiding dangerous terrain; plan fuel with night contingency.',TRUE),
    ('d0000000-0000-0000-0000-000000000126','c0000000-0000-0000-0000-000000000103', 2,'Chart preparation for night flight','Highlight checkpoints visible at night (towns, lit motorways, coastal features); mark airspace.',TRUE),
    ('d0000000-0000-0000-0000-000000000127','c0000000-0000-0000-0000-000000000103', 3,'Town and city light identification','Use urban lighting patterns, industrial complexes and road networks as visual checkpoints.',TRUE),
    ('d0000000-0000-0000-0000-000000000128','c0000000-0000-0000-0000-000000000103', 4,'Map reading at night','Identify lakes, rivers, coastlines and lit infrastructure to confirm position.',TRUE),
    ('d0000000-0000-0000-0000-000000000129','c0000000-0000-0000-0000-000000000103', 5,'Radio navigation aids at night','Tune and interpret VOR, NDB and GPS for track confirmation and position fixing.',TRUE),
    ('d0000000-0000-0000-0000-000000000130','c0000000-0000-0000-0000-000000000103', 6,'Dead reckoning at night','Maintain accurate heading and time keeping; apply variation and deviation; estimate position.',TRUE),
    ('d0000000-0000-0000-0000-000000000131','c0000000-0000-0000-0000-000000000103', 7,'Night diversion','Identify need to divert; select suitable lit aerodrome; navigate to it with minimum delay.',TRUE),
    ('d0000000-0000-0000-0000-000000000132','c0000000-0000-0000-0000-000000000103', 8,'Position fixing at night','Cross-fix position using two independent navaids or visual/navaid combination.',TRUE),
    ('d0000000-0000-0000-0000-000000000133','c0000000-0000-0000-0000-000000000103', 9,'Unexpected IMC at night','Immediate 180° turn or climb; maintain control on instruments; contact ATC; declare Mayday.',TRUE),
    ('d0000000-0000-0000-0000-000000000134','c0000000-0000-0000-0000-000000000103',10,'Fuel monitoring on night nav','Record fuel state at each checkpoint; compare against plan; decide on diversion threshold.',TRUE),
    ('d0000000-0000-0000-0000-000000000135','c0000000-0000-0000-0000-000000000103',11,'Night airspace compliance','Identify Class C/D boundaries at night; obtain clearances; squawk as instructed.',TRUE),
    ('d0000000-0000-0000-0000-000000000136','c0000000-0000-0000-0000-000000000103',12,'Fatigue management on night flight','Recognise personal fatigue indicators; apply crew alertness techniques for extended night ops.',FALSE),

    -- N04 Solo Night Circuits – 10 items
    ('d0000000-0000-0000-0000-000000000137','c0000000-0000-0000-0000-000000000104', 1,'Pre-solo night authorisation','Complete instructor sign-off; confirm weather, NOTAM and solo endorsement before flight.',TRUE),
    ('d0000000-0000-0000-0000-000000000138','c0000000-0000-0000-0000-000000000104', 2,'Solo normal night circuit','Execute complete solo circuit; maintain circuit height ±100 ft; correct spacing from other traffic.',TRUE),
    ('d0000000-0000-0000-0000-000000000139','c0000000-0000-0000-0000-000000000104', 3,'Solo night landing','Achieve consistent touchdown on nominated touchdown zone; smooth deceleration.',TRUE),
    ('d0000000-0000-0000-0000-000000000140','c0000000-0000-0000-0000-000000000104', 4,'Solo radio communication','Conduct all radio calls independently; respond correctly to ATC instructions; use light signals if needed.',TRUE),
    ('d0000000-0000-0000-0000-000000000141','c0000000-0000-0000-0000-000000000104', 5,'Solo go-around decision','Correctly identify unstabilised approach; execute go-around without prompting; report intention.',TRUE),
    ('d0000000-0000-0000-0000-000000000142','c0000000-0000-0000-0000-000000000104', 6,'Runway and taxiway awareness solo','Identify active runway at night; hold correct position; no runway incursion incidents.',TRUE),
    ('d0000000-0000-0000-0000-000000000143','c0000000-0000-0000-0000-000000000104', 7,'Circuit spacing and sequencing','Maintain safe distance from preceding aircraft; comply with sequencing instructions.',TRUE),
    ('d0000000-0000-0000-0000-000000000144','c0000000-0000-0000-0000-000000000104', 8,'Solo emergency brief review','Demonstrate awareness of engine failure actions during briefing before solo departure.',TRUE),
    ('d0000000-0000-0000-0000-000000000145','c0000000-0000-0000-0000-000000000104', 9,'Minimum five solo night landings','Complete at least five full-stop landings as required by Part-FCL NR.',TRUE),
    ('d0000000-0000-0000-0000-000000000146','c0000000-0000-0000-0000-000000000104',10,'Post-solo self-debrief','Accurately identify own strengths and areas for improvement after each solo sector.',FALSE),

    -- N05 Night Cross-Country – 13 items
    ('d0000000-0000-0000-0000-000000000147','c0000000-0000-0000-0000-000000000105', 1,'Night cross-country planning documentation','Complete nav log with night-specific fuel contingency, sunrise/sunset, NOTAM and weather brief.',TRUE),
    ('d0000000-0000-0000-0000-000000000148','c0000000-0000-0000-0000-000000000105', 2,'Alternate aerodrome selection at night','Identify at least one suitable alternate with night operating capability.',TRUE),
    ('d0000000-0000-0000-0000-000000000149','c0000000-0000-0000-0000-000000000105', 3,'Departure and initial climb at night','Maintain runway heading until safe altitude; establish cruise configuration; confirm track.',TRUE),
    ('d0000000-0000-0000-0000-000000000150','c0000000-0000-0000-0000-000000000105', 4,'First-leg navigation accuracy','Arrive at first checkpoint within ±5 NM of planned position and within ±3 min of ETA.',TRUE),
    ('d0000000-0000-0000-0000-000000000151','c0000000-0000-0000-0000-000000000105', 5,'Checkpoint identification at night','Positively identify each planned checkpoint using at least two independent references.',TRUE),
    ('d0000000-0000-0000-0000-000000000152','c0000000-0000-0000-0000-000000000105', 6,'ATC communication en route','Give accurate position reports; request flight information service; manage frequency changes.',TRUE),
    ('d0000000-0000-0000-0000-000000000153','c0000000-0000-0000-0000-000000000105', 7,'Track error correction','Identify deviation from planned track and apply correct heading correction with minimum delay.',TRUE),
    ('d0000000-0000-0000-0000-000000000154','c0000000-0000-0000-0000-000000000105', 8,'Arrival at destination night aerodrome','Join circuit correctly at unfamiliar aerodrome; identify runway direction; comply with procedures.',TRUE),
    ('d0000000-0000-0000-0000-000000000155','c0000000-0000-0000-0000-000000000105', 9,'Landing at destination','Achieve safe landing at destination; comply with local procedures; park correctly.',TRUE),
    ('d0000000-0000-0000-0000-000000000156','c0000000-0000-0000-0000-000000000105',10,'Fuel and documentation at stop','Record fuel state; update nav log; check NOTAM and weather for return leg.',TRUE),
    ('d0000000-0000-0000-0000-000000000157','c0000000-0000-0000-0000-000000000105',11,'Return-leg navigation','Navigate return independently without instructor prompting; maintain track within tolerance.',TRUE),
    ('d0000000-0000-0000-0000-000000000158','c0000000-0000-0000-0000-000000000105',12,'Night weather reassessment en route','Continuously monitor weather; correctly decide to continue, divert or return if conditions change.',TRUE),
    ('d0000000-0000-0000-0000-000000000159','c0000000-0000-0000-0000-000000000105',13,'Night cross-country minimum distance','Demonstrate completion of ≥27 NM route with one full-stop landing as required by Part-FCL NR.',TRUE),

    -- N06 Night Rating Skill Test – 11 items
    ('d0000000-0000-0000-0000-000000000160','c0000000-0000-0000-0000-000000000106', 1,'Skill test planning to examiner standard','Produce complete, accurate flight plan; brief examiner on route, fuel, alternates and NOTAMs.',TRUE),
    ('d0000000-0000-0000-0000-000000000161','c0000000-0000-0000-0000-000000000106', 2,'Pre-flight inspection at night','Complete aircraft pre-flight inspection with torch; verify all lights serviceable.',TRUE),
    ('d0000000-0000-0000-0000-000000000162','c0000000-0000-0000-0000-000000000106', 3,'Night departure and initial nav','Depart aerodrome; establish on planned track; confirm position within 5 min.',TRUE),
    ('d0000000-0000-0000-0000-000000000163','c0000000-0000-0000-0000-000000000106', 4,'En-route navigation (skill test)','Demonstrate accurate navigation; maintain altitude ±100 ft; track ±5°.',TRUE),
    ('d0000000-0000-0000-0000-000000000164','c0000000-0000-0000-0000-000000000106', 5,'Position fixing (skill test)','Fix position to examiner satisfaction using two independent methods.',TRUE),
    ('d0000000-0000-0000-0000-000000000165','c0000000-0000-0000-0000-000000000106', 6,'Night circuit at intermediate aerodrome','Complete at least one circuit and landing at an intermediate aerodrome during skill test.',TRUE),
    ('d0000000-0000-0000-0000-000000000166','c0000000-0000-0000-0000-000000000106', 7,'Simulated emergency (skill test)','Respond correctly to examiner-initiated simulated emergency; demonstrate priority actions.',TRUE),
    ('d0000000-0000-0000-0000-000000000167','c0000000-0000-0000-0000-000000000106', 8,'Basic instrument flying (skill test)','Maintain control on instruments for 5 min; execute a 180° turn on instruments.',TRUE),
    ('d0000000-0000-0000-0000-000000000168','c0000000-0000-0000-0000-000000000106', 9,'Night cross-country leg (skill test)','Accurately complete the cross-country segment to examiner standard.',TRUE),
    ('d0000000-0000-0000-0000-000000000169','c0000000-0000-0000-0000-000000000106',10,'Night arrival and final landing','Return to home aerodrome; complete night circuit; achieve accurate landing.',TRUE),
    ('d0000000-0000-0000-0000-000000000170','c0000000-0000-0000-0000-000000000106',11,'Post-flight documentation','Complete all required post-flight documentation; sign technical log.',TRUE);

-- ----------------------------------------------------------------
-- 5a. Syllabus v2.0.0 (PUBLISHED) — revised content
-- ----------------------------------------------------------------
INSERT INTO dto.syllabus (
    syllabus_id,
    program_id,
    major_version,
    minor_version,
    patch_version,
    description,
    min_block_time_mins,
    status,
    published_at,
    created_by,
    updated_by
) VALUES (
    'b0000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000002',
    2, 0, 0,
    'Night Rating syllabus v2 — expanded curriculum with increased minimum flight time and modern avionics competency.',
    420,
    'PUBLISHED',
    '2026-03-01 09:00:00+00',
    'Liisa1',
    'Liisa1'
);

-- ----------------------------------------------------------------
-- 5b. Syllabus v2 flights (same structure, updated content)
-- ----------------------------------------------------------------
INSERT INTO dto.syllabus_flights (
    flight_id, syllabus_id, sort_order, code, name, description,
    tags, is_interim_checkpoint, recommended_block_time_mins
) VALUES
    (
        'c0000000-0000-0000-0000-000000000201',
        'b0000000-0000-0000-0000-000000000003',
        1, 'N01', 'Night Familiarisation',
        'Introduction to the night environment: aircraft and aerodrome lighting, night vision, cockpit management and modern avionics at night.',
        '{"NIGHT"}', FALSE, 90
    ),
    (
        'c0000000-0000-0000-0000-000000000202',
        'b0000000-0000-0000-0000-000000000003',
        2, 'N02', 'Night Circuits',
        'Night circuit flying with instructor: normal and flapless circuits, PAPI use, go-arounds and emergency drills.',
        '{"NIGHT"}', FALSE, 90
    ),
    (
        'c0000000-0000-0000-0000-000000000203',
        'b0000000-0000-0000-0000-000000000003',
        3, 'N03', 'Night Navigation',
        'VFR night navigation using visual landmarks, GNSS, radio aids and dead reckoning. Diversion and unexpected IMC procedures.',
        '{"NIGHT","XC"}', FALSE, 120
    ),
    (
        'c0000000-0000-0000-0000-000000000204',
        'b0000000-0000-0000-0000-000000000003',
        4, 'N04', 'Solo Night Circuits',
        'Minimum five solo take-offs and five full-stop night landings. Includes solo circuit entry at an unfamiliar aerodrome.',
        '{"NIGHT","SOLO"}', FALSE, 60
    ),
    (
        'c0000000-0000-0000-0000-000000000205',
        'b0000000-0000-0000-0000-000000000003',
        5, 'N05', 'Night Cross-Country',
        'Night cross-country of at least 50 NM with ADS-B traffic awareness and a full-stop landing at destination.',
        '{"NIGHT","SOLO","XC"}', FALSE, 180
    ),
    (
        'c0000000-0000-0000-0000-000000000206',
        'b0000000-0000-0000-0000-000000000003',
        6, 'N06', 'Night Rating Skill Test',
        'Skill test with an examiner; includes GNSS navigation, modern avionics and instrument recovery exercise.',
        '{"NIGHT"}', FALSE, 90
    );

-- ----------------------------------------------------------------
-- 5c. Syllabus v2 flight items  (73 items total)
-- ----------------------------------------------------------------
INSERT INTO dto.syllabus_flight_items (
    item_id, syllabus_flight_id, sort_order, name, description, mandatory
) VALUES
    -- N01 Night Familiarisation (v2) – 12 items (added avionics/GNSS item)
    ('d0000000-0000-0000-0000-000000000201','c0000000-0000-0000-0000-000000000201', 1,'Aircraft lighting systems check','Verify and operate nav/position lights, landing light, anti-collision beacon and cockpit lighting.',TRUE),
    ('d0000000-0000-0000-0000-000000000202','c0000000-0000-0000-0000-000000000201', 2,'Aerodrome lighting interpretation','Identify runway edge lights, threshold lights, PAPI/VASIS, taxiway centreline and stop bars.',TRUE),
    ('d0000000-0000-0000-0000-000000000203','c0000000-0000-0000-0000-000000000201', 3,'Night-adapted vision techniques','Use peripheral (off-centre) vision; allow adequate dark adaptation; understand cone vs. rod vision.',TRUE),
    ('d0000000-0000-0000-0000-000000000204','c0000000-0000-0000-0000-000000000201', 4,'Cockpit lighting management','Set instrument and chart lighting to minimise glare; use red light to preserve dark adaptation.',TRUE),
    ('d0000000-0000-0000-0000-000000000205','c0000000-0000-0000-0000-000000000201', 5,'Spatial disorientation prevention','Recognise leans, graveyard spiral and other vestibular illusions; trust instruments over senses.',TRUE),
    ('d0000000-0000-0000-0000-000000000206','c0000000-0000-0000-0000-000000000201', 6,'Night visual illusions','Understand black-hole approach, featureless-terrain illusion and false horizon; mitigation strategies.',TRUE),
    ('d0000000-0000-0000-0000-000000000207','c0000000-0000-0000-0000-000000000201', 7,'Night meteorology assessment','Detect developing weather at night using ground lighting patterns, stars occultation and radar.',TRUE),
    ('d0000000-0000-0000-0000-000000000208','c0000000-0000-0000-0000-000000000201', 8,'Emergency lighting and equipment','Know backup torch location; test before flight; understand passenger safety equipment at night.',TRUE),
    ('d0000000-0000-0000-0000-000000000209','c0000000-0000-0000-0000-000000000201', 9,'ATC light signals at night','Correctly interpret and respond to aerodrome light signals when radio fails.',TRUE),
    ('d0000000-0000-0000-0000-000000000210','c0000000-0000-0000-0000-000000000201',10,'Night taxiing technique','Follow taxiway centreline lighting; hold at lit stop bars; use airport diagram and ground radar if available.',TRUE),
    ('d0000000-0000-0000-0000-000000000211','c0000000-0000-0000-0000-000000000201',11,'GNSS and avionics setup at night','Configure glass cockpit / GNSS at night; manage screen brightness; cross-check with standby instruments.',TRUE),
    ('d0000000-0000-0000-0000-000000000212','c0000000-0000-0000-0000-000000000201',12,'Navigation lights verification','Confirm aircraft navigation lights visible; know reporting procedure for unserviceable lights.',FALSE),

    -- N02 Night Circuits (v2) – 13 items
    ('d0000000-0000-0000-0000-000000000213','c0000000-0000-0000-0000-000000000202', 1,'Pre-takeoff night lighting check','Final check of all external lights before entering runway at night.',TRUE),
    ('d0000000-0000-0000-0000-000000000214','c0000000-0000-0000-0000-000000000202', 2,'Night runway environment assessment','Identify runway end, displaced threshold, touchdown zone and overrun area from holding point.',TRUE),
    ('d0000000-0000-0000-0000-000000000215','c0000000-0000-0000-0000-000000000202', 3,'Normal night circuit','Maintain correct circuit height and position using altimeter; identify position lights of other traffic.',TRUE),
    ('d0000000-0000-0000-0000-000000000216','c0000000-0000-0000-0000-000000000202', 4,'PAPI/VASIS interpretation at night','Use glide-slope lighting; understand colour coding; maintain three-white/one-red target.',TRUE),
    ('d0000000-0000-0000-0000-000000000217','c0000000-0000-0000-0000-000000000202', 5,'Stabilised night approach','Maintain stable speed, rate of descent and centreline alignment from 500 ft AGL.',TRUE),
    ('d0000000-0000-0000-0000-000000000218','c0000000-0000-0000-0000-000000000202', 6,'Night landing flare and touchdown','Judge flare height using peripheral vision and radio altimeter; smooth touchdown in zone.',TRUE),
    ('d0000000-0000-0000-0000-000000000219','c0000000-0000-0000-0000-000000000202', 7,'Landing light management','Deploy and retract landing light correctly; be aware of dazzle on wet or reflective surfaces.',TRUE),
    ('d0000000-0000-0000-0000-000000000220','c0000000-0000-0000-0000-000000000202', 8,'Touch-and-go at night','Execute clean touch-and-go; complete checklist during roll; maintain runway directional control.',TRUE),
    ('d0000000-0000-0000-0000-000000000221','c0000000-0000-0000-0000-000000000202', 9,'Go-around at night','Apply power correctly; maintain runway centreline; retract flap in stages; radio go-around call.',TRUE),
    ('d0000000-0000-0000-0000-000000000222','c0000000-0000-0000-0000-000000000202',10,'Engine failure on departure at night','Immediate actions: maintain control; land ahead or execute emergency return; Mayday call.',TRUE),
    ('d0000000-0000-0000-0000-000000000223','c0000000-0000-0000-0000-000000000202',11,'Runway incursion prevention','Identify hot spots; comply with hold-short clearances; scan runway before entering.',TRUE),
    ('d0000000-0000-0000-0000-000000000224','c0000000-0000-0000-0000-000000000202',12,'Flapless circuit and landing at night','Execute flapless approach; adjust pitch attitude and speed; achieve smooth flapless touchdown.',FALSE),
    ('d0000000-0000-0000-0000-000000000225','c0000000-0000-0000-0000-000000000202',13,'Short-field landing at night','Achieve touchdown before nominated point; use full flap; apply firm braking.',FALSE),

    -- N03 Night Navigation (v2) – 12 items  (dead reckoning → GNSS/DR combined)
    ('d0000000-0000-0000-0000-000000000226','c0000000-0000-0000-0000-000000000203', 1,'Night pre-flight planning','Produce nav log with night-specific fuel contingency; identify visible landmarks; check sunset/sunrise.',TRUE),
    ('d0000000-0000-0000-0000-000000000227','c0000000-0000-0000-0000-000000000203', 2,'Chart and GNSS preparation','Mark visible night waypoints on chart; programme GNSS with route; set display brightness.',TRUE),
    ('d0000000-0000-0000-0000-000000000228','c0000000-0000-0000-0000-000000000203', 3,'Town and city light identification','Use urban lighting patterns, motorways, industrial sites and coastal features as checkpoints.',TRUE),
    ('d0000000-0000-0000-0000-000000000229','c0000000-0000-0000-0000-000000000203', 4,'Map reading at night','Identify lakes, rivers, coastlines and lit infrastructure to cross-check GNSS position.',TRUE),
    ('d0000000-0000-0000-0000-000000000230','c0000000-0000-0000-0000-000000000203', 5,'GNSS and radio navigation at night','Use GNSS as primary; cross-check with VOR/NDB; recognise RAIM degradation warning.',TRUE),
    ('d0000000-0000-0000-0000-000000000231','c0000000-0000-0000-0000-000000000203', 6,'Dead reckoning as backup','Maintain heading and timing log; estimate position manually when GNSS is lost.',TRUE),
    ('d0000000-0000-0000-0000-000000000232','c0000000-0000-0000-0000-000000000203', 7,'Night diversion','Identify divert trigger; select suitable alternate; update GNSS; navigate to alternate.',TRUE),
    ('d0000000-0000-0000-0000-000000000233','c0000000-0000-0000-0000-000000000203', 8,'Position fixing at night','Cross-fix position using visual features and navaid; resolve any positional uncertainty.',TRUE),
    ('d0000000-0000-0000-0000-000000000234','c0000000-0000-0000-0000-000000000203', 9,'Unexpected IMC at night','Execute immediate 180° turn; contact ATC; declare emergency; fly instruments to safety.',TRUE),
    ('d0000000-0000-0000-0000-000000000235','c0000000-0000-0000-0000-000000000203',10,'Fuel monitoring on night nav','Check fuel state at each checkpoint; compare with plan; apply FREDA checks routinely.',TRUE),
    ('d0000000-0000-0000-0000-000000000236','c0000000-0000-0000-0000-000000000203',11,'Night airspace compliance','Track airspace boundaries on GNSS moving map; obtain clearances; squawk as instructed.',TRUE),
    ('d0000000-0000-0000-0000-000000000237','c0000000-0000-0000-0000-000000000203',12,'Fatigue management on night flight','Apply alertness techniques; recognise personal fatigue; make go/no-go decisions accordingly.',FALSE),

    -- N04 Solo Night Circuits (v2) – 11 items (added solo entry at unfamiliar aerodrome)
    ('d0000000-0000-0000-0000-000000000238','c0000000-0000-0000-0000-000000000204', 1,'Pre-solo night authorisation','Complete instructor sign-off; verify weather, NOTAM, fuel and solo endorsement.',TRUE),
    ('d0000000-0000-0000-0000-000000000239','c0000000-0000-0000-0000-000000000204', 2,'Solo normal night circuit','Execute complete solo circuit; maintain height ±100 ft; correct spacing.',TRUE),
    ('d0000000-0000-0000-0000-000000000240','c0000000-0000-0000-0000-000000000204', 3,'Solo night landing','Achieve consistent touchdown in zone; smooth deceleration to taxi speed.',TRUE),
    ('d0000000-0000-0000-0000-000000000241','c0000000-0000-0000-0000-000000000204', 4,'Solo radio communication','Conduct all radio calls independently; respond correctly to ATC; use light signals if needed.',TRUE),
    ('d0000000-0000-0000-0000-000000000242','c0000000-0000-0000-0000-000000000204', 5,'Solo go-around decision','Identify unstabilised approach; execute go-around without prompting; report to ATC.',TRUE),
    ('d0000000-0000-0000-0000-000000000243','c0000000-0000-0000-0000-000000000204', 6,'Runway and taxiway awareness solo','Identify active runway; hold correct positions; maintain vigilance for runway incursion.',TRUE),
    ('d0000000-0000-0000-0000-000000000244','c0000000-0000-0000-0000-000000000204', 7,'Circuit spacing and sequencing','Maintain safe separation from preceding aircraft; comply with ATC sequencing.',TRUE),
    ('d0000000-0000-0000-0000-000000000245','c0000000-0000-0000-0000-000000000204', 8,'Solo emergency brief review','Demonstrate awareness of engine failure actions before solo departure.',TRUE),
    ('d0000000-0000-0000-0000-000000000246','c0000000-0000-0000-0000-000000000204', 9,'Minimum five solo night landings','Complete ≥5 full-stop landings as required by Part-FCL NR.',TRUE),
    ('d0000000-0000-0000-0000-000000000247','c0000000-0000-0000-0000-000000000204',10,'Solo circuit entry at unfamiliar aerodrome','Overhead-join or straight-in approach at a second aerodrome; identify runway and lighting unaided.',TRUE),
    ('d0000000-0000-0000-0000-000000000248','c0000000-0000-0000-0000-000000000204',11,'Post-solo self-debrief','Evaluate own performance accurately; identify areas for improvement before next flight.',FALSE),

    -- N05 Night Cross-Country (v2) – 14 items (added ADS-B traffic awareness)
    ('d0000000-0000-0000-0000-000000000249','c0000000-0000-0000-0000-000000000205', 1,'Night cross-country planning documentation','Complete nav log; identify night-visible waypoints; fuel plan with contingency; weather brief.',TRUE),
    ('d0000000-0000-0000-0000-000000000250','c0000000-0000-0000-0000-000000000205', 2,'Alternate aerodrome selection at night','Identify ≥1 suitable alternate with confirmed night capability and adequate fuel.',TRUE),
    ('d0000000-0000-0000-0000-000000000251','c0000000-0000-0000-0000-000000000205', 3,'Departure and initial climb at night','Maintain runway heading to safe altitude; establish cruise; confirm planned track.',TRUE),
    ('d0000000-0000-0000-0000-000000000252','c0000000-0000-0000-0000-000000000205', 4,'First-leg navigation accuracy','Arrive at first checkpoint within ±5 NM; ETA within ±3 min.',TRUE),
    ('d0000000-0000-0000-0000-000000000253','c0000000-0000-0000-0000-000000000205', 5,'Checkpoint identification at night','Positively identify each waypoint using ≥2 independent references.',TRUE),
    ('d0000000-0000-0000-0000-000000000254','c0000000-0000-0000-0000-000000000205', 6,'ADS-B traffic awareness at night','Monitor traffic picture on EFB/transponder display; resolve conflicts; report as required.',TRUE),
    ('d0000000-0000-0000-0000-000000000255','c0000000-0000-0000-0000-000000000205', 7,'ATC communication en route','Accurate position reports; frequency changes; request flight information service.',TRUE),
    ('d0000000-0000-0000-0000-000000000256','c0000000-0000-0000-0000-000000000205', 8,'Track error correction','Identify and correct deviation; log heading correction in nav log.',TRUE),
    ('d0000000-0000-0000-0000-000000000257','c0000000-0000-0000-0000-000000000205', 9,'Arrival at destination night aerodrome','Join circuit correctly; identify runway direction; comply with local procedures.',TRUE),
    ('d0000000-0000-0000-0000-000000000258','c0000000-0000-0000-0000-000000000205',10,'Landing at destination','Safe landing; comply with local procedures; park and shut down correctly.',TRUE),
    ('d0000000-0000-0000-0000-000000000259','c0000000-0000-0000-0000-000000000205',11,'Fuel and documentation at stop','Record fuel; update nav log; check NOTAM and weather for return.',TRUE),
    ('d0000000-0000-0000-0000-000000000260','c0000000-0000-0000-0000-000000000205',12,'Return-leg navigation','Navigate independently without instructor prompting; maintain accuracy.',TRUE),
    ('d0000000-0000-0000-0000-000000000261','c0000000-0000-0000-0000-000000000205',13,'Night weather reassessment en route','Monitor conditions continuously; decide correctly to continue, divert or return.',TRUE),
    ('d0000000-0000-0000-0000-000000000262','c0000000-0000-0000-0000-000000000205',14,'Night cross-country minimum distance ≥50 NM','Complete ≥50 NM route with one full-stop landing (v2 extended distance requirement).',TRUE),

    -- N06 Night Rating Skill Test (v2) – 12 items (added weather brief + GNSS item)
    ('d0000000-0000-0000-0000-000000000263','c0000000-0000-0000-0000-000000000206', 1,'Skill test planning to examiner standard','Produce complete, accurate flight plan; brief examiner on route, fuel, alternates and NOTAMs.',TRUE),
    ('d0000000-0000-0000-0000-000000000264','c0000000-0000-0000-0000-000000000206', 2,'Night weather brief for examiner','Present a concise weather assessment including TAF, METAR and pilot report for route.',TRUE),
    ('d0000000-0000-0000-0000-000000000265','c0000000-0000-0000-0000-000000000206', 3,'Pre-flight inspection at night','Complete aircraft pre-flight; verify all lights serviceable; test emergency torch.',TRUE),
    ('d0000000-0000-0000-0000-000000000266','c0000000-0000-0000-0000-000000000206', 4,'Night departure and initial nav','Depart aerodrome; establish on planned track; confirm position within 5 min.',TRUE),
    ('d0000000-0000-0000-0000-000000000267','c0000000-0000-0000-0000-000000000206', 5,'En-route navigation (skill test)','Maintain altitude ±100 ft; track ±5°; manage fuel and FREDA checks.',TRUE),
    ('d0000000-0000-0000-0000-000000000268','c0000000-0000-0000-0000-000000000206', 6,'GNSS position fixing (skill test)','Demonstrate GNSS use and validate position with traditional navaid or visual fix.',TRUE),
    ('d0000000-0000-0000-0000-000000000269','c0000000-0000-0000-0000-000000000206', 7,'Night circuit at intermediate aerodrome','Complete ≥1 circuit and landing at intermediate aerodrome to examiner standard.',TRUE),
    ('d0000000-0000-0000-0000-000000000270','c0000000-0000-0000-0000-000000000206', 8,'Simulated emergency (skill test)','Respond correctly to examiner-initiated emergency; demonstrate priority actions.',TRUE),
    ('d0000000-0000-0000-0000-000000000271','c0000000-0000-0000-0000-000000000206', 9,'Basic instrument flying (skill test)','Maintain control on instruments; execute 180° turn; recover from unusual attitude.',TRUE),
    ('d0000000-0000-0000-0000-000000000272','c0000000-0000-0000-0000-000000000206',10,'Night cross-country leg (skill test)','Accurately complete cross-country segment to examiner standard.',TRUE),
    ('d0000000-0000-0000-0000-000000000273','c0000000-0000-0000-0000-000000000206',11,'Night arrival and final landing','Return to home aerodrome; complete night circuit; achieve accurate landing.',TRUE),
    ('d0000000-0000-0000-0000-000000000274','c0000000-0000-0000-0000-000000000206',12,'Post-flight documentation','Complete all required post-flight documentation; sign technical log.',TRUE);

-- ----------------------------------------------------------------
-- 6. Member syllabus assignments
-- ----------------------------------------------------------------
INSERT INTO dto.member_syllabus (
    member_syllabus_id, member_id, syllabus_id, is_active, assigned_at, assigned_by
) VALUES
    -- Risto1 on v1.0.0
    (
        'e0000000-0000-0000-0000-000000000003',
        'Risto1',
        'b0000000-0000-0000-0000-000000000002',
        TRUE,
        '2026-02-28 09:00:00+00',
        'Liisa1'
    ),
    -- Pirjo1 on v1.0.0
    (
        'e0000000-0000-0000-0000-000000000004',
        'Pirjo1',
        'b0000000-0000-0000-0000-000000000002',
        TRUE,
        '2026-02-28 10:00:00+00',
        'Liisa1'
    ),
    -- Teemu1 on v2.0.0
    (
        'e0000000-0000-0000-0000-000000000005',
        'Teemu1',
        'b0000000-0000-0000-0000-000000000003',
        TRUE,
        '2026-03-15 09:00:00+00',
        'Liisa1'
    );

-- ----------------------------------------------------------------
-- 7. Flight log entries for night DTO attempts
-- ----------------------------------------------------------------
-- All flights depart at 20:00 UTC (22:00 local Finnish time) in
-- March–April 2026 so all flying time is at night.
-- Base epoch: 2026-03-06 20:00 UTC = 1772830800
-- All epoch values are exactly divisible by 60.
-- Aircraft OH-P28 (ajlb_seq_no=4, the existing open logbook)
-- ----------------------------------------------------------------
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
    -- Risto1 – N01 Night Familiarisation (2026-03-06 20:00–21:20 UTC, 80 min block)
    (
        'rs1nr01a',
        'Risto1', 'Risto1',
        (SELECT last_name FROM member.register WHERE member_id = 'Risto1'),
        'STU',
        'Jukka1',
        (SELECT last_name FROM member.register WHERE member_id = 'Jukka1'),
        'FI',
        'OH-P28',
        1772830800, 1772831400, 1772835000, 1772835600,
        NULL, 18.0, 16.0,
        2, 2, 70, 0,
        'EFHK', 'EFHK', 'SCHOOL', NULL, 'Night familiarisation flight – lighting and circuits',
        'Risto1', 'Risto1',
        FALSE, 'C', 4, 0, 'NEW', TRUE
    ),
    -- Risto1 – N02 Night Circuits (2026-03-13 20:00–21:40 UTC, 100 min block)
    (
        'rs1nr02a',
        'Risto1', 'Risto1',
        (SELECT last_name FROM member.register WHERE member_id = 'Risto1'),
        'STU',
        'Jukka1',
        (SELECT last_name FROM member.register WHERE member_id = 'Jukka1'),
        'FI',
        'OH-P28',
        1773435600, 1773436200, 1773441600, 1773442200,
        NULL, 22.0, 14.0,
        2, 5, 90, 0,
        'EFHK', 'EFHK', 'SCHOOL', NULL, 'Night circuit training – 5 landings',
        'Risto1', 'Risto1',
        FALSE, 'C', 4, 0, 'NEW', TRUE
    ),
    -- Risto1 – N03 Night Navigation (2026-03-20 20:00–22:10 UTC, 130 min block)
    (
        'rs1nr03a',
        'Risto1', 'Risto1',
        (SELECT last_name FROM member.register WHERE member_id = 'Risto1'),
        'STU',
        'Jukka1',
        (SELECT last_name FROM member.register WHERE member_id = 'Jukka1'),
        'FI',
        'OH-P28',
        1774040400, 1774041000, 1774047600, 1774048200,
        NULL, 32.0, 10.0,
        2, 1, 120, 0,
        'EFHK', 'EFTU', 'SCHOOL', NULL, 'Night navigation EFHK–EFTU–EFHK',
        'Risto1', 'Risto1',
        FALSE, 'C', 4, 0, 'NEW', TRUE
    ),
    -- Risto1 – N04 Solo Night Circuits (2026-03-27 20:00–21:20 UTC, 80 min block, solo)
    (
        'rs1nr04a',
        'Risto1', 'Risto1',
        (SELECT last_name FROM member.register WHERE member_id = 'Risto1'),
        'STU',
        NULL, NULL, NULL,
        'OH-P28',
        1774645200, 1774645800, 1774649400, 1774650000,
        NULL, 20.0, 15.0,
        1, 6, 60, 0,
        'EFHK', 'EFHK', 'SCHOOL', NULL, 'Solo night circuits – 6 landings',
        'Risto1', 'Risto1',
        FALSE, 'C', 4, 0, 'NEW', TRUE
    ),
    -- Pirjo1 – N01 Night Familiarisation (2026-03-07 20:00–21:20 UTC, 80 min block)
    (
        'pi1nr01a',
        'Pirjo1', 'Pirjo1',
        (SELECT last_name FROM member.register WHERE member_id = 'Pirjo1'),
        'STU',
        'Jukka1',
        (SELECT last_name FROM member.register WHERE member_id = 'Jukka1'),
        'FI',
        'OH-P28',
        1772917200, 1772917800, 1772921400, 1772922000,
        NULL, 18.0, 16.0,
        2, 2, 70, 0,
        'EFHK', 'EFHK', 'SCHOOL', NULL, 'Night familiarisation flight',
        'Pirjo1', 'Pirjo1',
        FALSE, 'C', 4, 0, 'NEW', TRUE
    ),
    -- Pirjo1 – N02 Night Circuits (2026-03-21 20:00–21:40 UTC, 100 min block, not yet verified)
    (
        'pi1nr02a',
        'Pirjo1', 'Pirjo1',
        (SELECT last_name FROM member.register WHERE member_id = 'Pirjo1'),
        'STU',
        'Jukka1',
        (SELECT last_name FROM member.register WHERE member_id = 'Jukka1'),
        'FI',
        'OH-P28',
        1774126800, 1774127400, 1774132200, 1774132800,
        NULL, 22.0, 14.0,
        2, 4, 90, 0,
        'EFHK', 'EFHK', 'SCHOOL', NULL, 'Night circuit training – 4 landings',
        'Pirjo1', 'Pirjo1',
        FALSE, 'C', 4, 0, 'NEW', TRUE
    ),
    -- Teemu1 – N01 Night Familiarisation v2 (2026-04-03 20:00–21:20 UTC, 80 min block)
    (
        'te1nr01a',
        'Teemu1', 'Teemu1',
        (SELECT last_name FROM member.register WHERE member_id = 'Teemu1'),
        'STU',
        'Jukka1',
        (SELECT last_name FROM member.register WHERE member_id = 'Jukka1'),
        'FI',
        'OH-P28',
        1775250000, 1775250600, 1775254200, 1775254800,
        NULL, 18.0, 16.0,
        2, 2, 70, 0,
        'EFHK', 'EFHK', 'SCHOOL', NULL, 'Night familiarisation – v2 syllabus',
        'Teemu1', 'Teemu1',
        FALSE, 'C', 4, 0, 'NEW', TRUE
    );

-- ----------------------------------------------------------------
-- 9. Syllabus flight attempts
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
    -- Risto1 N01 – APPROVED
    (
        'f0000000-0000-0000-0000-000000000010',
        'rs1nr01a',
        'c0000000-0000-0000-0000-000000000101',
        'e0000000-0000-0000-0000-000000000003',
        'Jukka1',
        'Good awareness of night environment. Dark adaptation technique excellent. Cockpit lighting well managed.',
        'APPROVED',
        '2026-03-06 22:00:00+00',
        'Jukka1'
    ),
    -- Risto1 N02 – APPROVED (two items HIL)
    (
        'f0000000-0000-0000-0000-000000000011',
        'rs1nr02a',
        'c0000000-0000-0000-0000-000000000102',
        'e0000000-0000-0000-0000-000000000003',
        'Jukka1',
        'Circuit shape and landings good. Crosswind correction inconsistent – moved to HIL. Short-field technique needs more practice.',
        'APPROVED',
        '2026-03-13 22:00:00+00',
        'Jukka1'
    ),
    -- Risto1 N03 – APPROVED (two items HIL)
    (
        'f0000000-0000-0000-0000-000000000012',
        'rs1nr03a',
        'c0000000-0000-0000-0000-000000000103',
        'e0000000-0000-0000-0000-000000000003',
        'Jukka1',
        'Navigation mostly accurate. Two late checkpoint calls. Unexpected IMC handling needs reinforcement – moved to HIL.',
        'APPROVED',
        '2026-03-20 22:30:00+00',
        'Jukka1'
    ),
    -- Risto1 N04 Solo – pending
    (
        'f0000000-0000-0000-0000-000000000013',
        'rs1nr04a',
        'c0000000-0000-0000-0000-000000000104',
        'e0000000-0000-0000-0000-000000000003',
        'Jukka1',
        NULL, NULL, NULL, NULL
    ),
    -- Pirjo1 N01 – APPROVED
    (
        'f0000000-0000-0000-0000-000000000014',
        'pi1nr01a',
        'c0000000-0000-0000-0000-000000000101',
        'e0000000-0000-0000-0000-000000000004',
        'Jukka1',
        'Excellent awareness from the start. Cockpit management and disorientation prevention well understood.',
        'APPROVED',
        '2026-03-07 22:00:00+00',
        'Jukka1'
    ),
    -- Pirjo1 N02 – pending
    (
        'f0000000-0000-0000-0000-000000000015',
        'pi1nr02a',
        'c0000000-0000-0000-0000-000000000102',
        'e0000000-0000-0000-0000-000000000004',
        'Jukka1',
        NULL, NULL, NULL, NULL
    ),
    -- Teemu1 N01 v2 – APPROVED (one HIL)
    (
        'f0000000-0000-0000-0000-000000000016',
        'te1nr01a',
        'c0000000-0000-0000-0000-000000000201',
        'e0000000-0000-0000-0000-000000000005',
        'Jukka1',
        'Good overall awareness. GNSS setup at night needs more practice – moved to HIL for dedicated exercise.',
        'APPROVED',
        '2026-04-03 22:00:00+00',
        'Jukka1'
    );

-- ----------------------------------------------------------------
-- 10. Per-item outcomes for verified attempts
-- ----------------------------------------------------------------
INSERT INTO dto.flight_item_outcomes (attempt_id, item_id, outcome, remarks) VALUES
    -- Risto1 N01 (all 11 COMPLETED)
    ('f0000000-0000-0000-0000-000000000010','d0000000-0000-0000-0000-000000000101','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000010','d0000000-0000-0000-0000-000000000102','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000010','d0000000-0000-0000-0000-000000000103','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000010','d0000000-0000-0000-0000-000000000104','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000010','d0000000-0000-0000-0000-000000000105','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000010','d0000000-0000-0000-0000-000000000106','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000010','d0000000-0000-0000-0000-000000000107','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000010','d0000000-0000-0000-0000-000000000108','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000010','d0000000-0000-0000-0000-000000000109','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000010','d0000000-0000-0000-0000-000000000110','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000010','d0000000-0000-0000-0000-000000000111','COMPLETED',NULL),

    -- Risto1 N02 (11 COMPLETED, crosswind + short-field → HIL)
    ('f0000000-0000-0000-0000-000000000011','d0000000-0000-0000-0000-000000000112','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000011','d0000000-0000-0000-0000-000000000113','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000011','d0000000-0000-0000-0000-000000000114','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000011','d0000000-0000-0000-0000-000000000115','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000011','d0000000-0000-0000-0000-000000000116','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000011','d0000000-0000-0000-0000-000000000117','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000011','d0000000-0000-0000-0000-000000000118','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000011','d0000000-0000-0000-0000-000000000119','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000011','d0000000-0000-0000-0000-000000000120','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000011','d0000000-0000-0000-0000-000000000121','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000011','d0000000-0000-0000-0000-000000000122','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000011','d0000000-0000-0000-0000-000000000123','MOVED_TO_HIL','Crosswind correction inconsistent on downwind and base; requires dedicated practice.'),
    ('f0000000-0000-0000-0000-000000000011','d0000000-0000-0000-0000-000000000124','MOVED_TO_HIL','Short-field technique not yet at required standard; deferred to HIL for extra sessions.'),

    -- Risto1 N03 (10 COMPLETED, 2 HIL)
    ('f0000000-0000-0000-0000-000000000012','d0000000-0000-0000-0000-000000000125','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000012','d0000000-0000-0000-0000-000000000126','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000012','d0000000-0000-0000-0000-000000000127','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000012','d0000000-0000-0000-0000-000000000128','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000012','d0000000-0000-0000-0000-000000000129','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000012','d0000000-0000-0000-0000-000000000130','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000012','d0000000-0000-0000-0000-000000000131','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000012','d0000000-0000-0000-0000-000000000132','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000012','d0000000-0000-0000-0000-000000000133','MOVED_TO_HIL','Unexpected IMC recovery was hesitant; needs practice with hood and ATC communication under stress.'),
    ('f0000000-0000-0000-0000-000000000012','d0000000-0000-0000-0000-000000000134','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000012','d0000000-0000-0000-0000-000000000135','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000012','d0000000-0000-0000-0000-000000000136','MOVED_TO_HIL','Fatigue management discussion deferred – needs dedicated ground briefing before night XC.'),

    -- Pirjo1 N01 (all 11 COMPLETED)
    ('f0000000-0000-0000-0000-000000000014','d0000000-0000-0000-0000-000000000101','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000014','d0000000-0000-0000-0000-000000000102','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000014','d0000000-0000-0000-0000-000000000103','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000014','d0000000-0000-0000-0000-000000000104','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000014','d0000000-0000-0000-0000-000000000105','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000014','d0000000-0000-0000-0000-000000000106','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000014','d0000000-0000-0000-0000-000000000107','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000014','d0000000-0000-0000-0000-000000000108','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000014','d0000000-0000-0000-0000-000000000109','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000014','d0000000-0000-0000-0000-000000000110','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000014','d0000000-0000-0000-0000-000000000111','COMPLETED',NULL),

    -- Teemu1 N01 v2 (11 COMPLETED, GNSS setup → HIL)
    ('f0000000-0000-0000-0000-000000000016','d0000000-0000-0000-0000-000000000201','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000016','d0000000-0000-0000-0000-000000000202','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000016','d0000000-0000-0000-0000-000000000203','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000016','d0000000-0000-0000-0000-000000000204','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000016','d0000000-0000-0000-0000-000000000205','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000016','d0000000-0000-0000-0000-000000000206','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000016','d0000000-0000-0000-0000-000000000207','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000016','d0000000-0000-0000-0000-000000000208','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000016','d0000000-0000-0000-0000-000000000209','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000016','d0000000-0000-0000-0000-000000000210','COMPLETED',NULL),
    ('f0000000-0000-0000-0000-000000000016','d0000000-0000-0000-0000-000000000211','MOVED_TO_HIL','GNSS screen management and brightness adjustment needs focused practice in the simulator first.'),
    ('f0000000-0000-0000-0000-000000000016','d0000000-0000-0000-0000-000000000212','COMPLETED',NULL);

-- ----------------------------------------------------------------
-- 11. HIL queue entries
-- ----------------------------------------------------------------
INSERT INTO dto.hil_queue (
    hil_id,
    member_id,
    syllabus_id,
    item_id,
    opened_on_attempt_id,
    opened_at,
    resolved_on_attempt_id,
    resolved_at,
    resolution_outcome,
    notes
) VALUES
    -- Risto1 – crosswind circuit at night (from N02)
    (
        '10000000-0000-0000-0000-000000000003',
        'Risto1',
        'b0000000-0000-0000-0000-000000000002',
        'd0000000-0000-0000-0000-000000000123',
        'f0000000-0000-0000-0000-000000000011',
        '2026-03-13 22:00:00+00',
        NULL, NULL, NULL,
        'Dedicated crosswind circuit practice required. Suggest simulator session before next night flight.'
    ),
    -- Risto1 – short-field landing at night (from N02, optional item but tracked)
    (
        '10000000-0000-0000-0000-000000000004',
        'Risto1',
        'b0000000-0000-0000-0000-000000000002',
        'd0000000-0000-0000-0000-000000000124',
        'f0000000-0000-0000-0000-000000000011',
        '2026-03-13 22:00:00+00',
        NULL, NULL, NULL,
        'Student to review short-field approach and landing technique; practise on daytime circuits first.'
    ),
    -- Risto1 – unexpected IMC at night (from N03)
    (
        '10000000-0000-0000-0000-000000000005',
        'Risto1',
        'b0000000-0000-0000-0000-000000000002',
        'd0000000-0000-0000-0000-000000000133',
        'f0000000-0000-0000-0000-000000000012',
        '2026-03-20 22:30:00+00',
        NULL, NULL, NULL,
        'IMC recovery hesitant. Practice 180° turn under hood with ATC radio work before solo night nav.'
    ),
    -- Risto1 – fatigue management (from N03, non-critical)
    (
        '10000000-0000-0000-0000-000000000006',
        'Risto1',
        'b0000000-0000-0000-0000-000000000002',
        'd0000000-0000-0000-0000-000000000136',
        'f0000000-0000-0000-0000-000000000012',
        '2026-03-20 22:30:00+00',
        NULL, NULL, NULL,
        'Ground briefing on fatigue indicators and alertness techniques to be completed before night XC.'
    ),
    -- Teemu1 – GNSS avionics setup (from N01 v2)
    (
        '10000000-0000-0000-0000-000000000007',
        'Teemu1',
        'b0000000-0000-0000-0000-000000000003',
        'd0000000-0000-0000-0000-000000000211',
        'f0000000-0000-0000-0000-000000000016',
        '2026-04-03 22:00:00+00',
        NULL, NULL, NULL,
        'Book simulator session for GNSS/glass cockpit night familiarisation before next flight.'
    );
