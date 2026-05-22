-- Instructor qualification seed data for development and testing.
-- Events are appended to the Emmett event store via emt_append_to_stream.
-- Each instructor gets one InstructorQualificationSet event on stream
-- instructor-qualification:{memberId}.
--
-- Expiry scenarios per instructor so the status table demonstrates
-- all visual states (expired / expiring-soon / valid):
--
--   current_date + 0  → expires TODAY  → rendered as red "expired" chip
--   current_date + 15 → expires in 15 days → rendered as yellow "expiring" chip
--   current_date + 30 → expires in 30 days → rendered as yellow "expiring" chip

-- ─── Matti1 — Matti Virtanen (INSTRUCTOR) ────────────────────────────────────
-- FI    : +30 d  (expiring-soon, orange)
-- IRI   : +0  d  (expires today, red)
-- CRI   : +30 d  (expiring-soon, orange)
-- SEP   : +15 d  (expiring-soon, orange)
-- MED I : +15 d  (expiring-soon, orange)
-- MED II: NULL   (not held)
-- LAPL  : NULL   (not held)
SELECT emt_append_to_stream(
    ARRAY[gen_random_uuid()::text],
    ARRAY[jsonb_build_object(
        'memberId',            'Matti1',
        'fiExpiry',            to_char(current_date + INTERVAL '30 days', 'YYYY-MM-DD'),
        'iriExpiry',           to_char(current_date, 'YYYY-MM-DD'),
        'criExpiry',           to_char(current_date + INTERVAL '30 days', 'YYYY-MM-DD'),
        'sepExpiry',           to_char(current_date + INTERVAL '15 days', 'YYYY-MM-DD'),
        'medicalClass1Expiry', to_char(current_date + INTERVAL '15 days', 'YYYY-MM-DD'),
        'medicalClass2Expiry', NULL,
        'medicalLaplExpiry',   NULL,
        'setBy',               'k1mnimda',
        'changedAt',           to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    )],
    ARRAY['{}'::jsonb],
    ARRAY['1'],
    ARRAY['InstructorQualificationSet'],
    ARRAY['E'],
    'instructor-qualification:Matti1',
    'instructor',
    NULL,
    'emt:default'
);

-- ─── Jukka1 — Jukka Nieminen (INSTRUCTOR) ────────────────────────────────────
-- FI    : +15 d
-- IRI   : NULL
-- CRI   : +0  d  (expires today, red)
-- SEP   : +30 d
-- MED I : NULL
-- MED II: +30 d
-- LAPL  : NULL
SELECT emt_append_to_stream(
    ARRAY[gen_random_uuid()::text],
    ARRAY[jsonb_build_object(
        'memberId',            'Jukka1',
        'fiExpiry',            to_char(current_date + INTERVAL '15 days', 'YYYY-MM-DD'),
        'iriExpiry',           NULL,
        'criExpiry',           to_char(current_date, 'YYYY-MM-DD'),
        'sepExpiry',           to_char(current_date + INTERVAL '30 days', 'YYYY-MM-DD'),
        'medicalClass1Expiry', NULL,
        'medicalClass2Expiry', to_char(current_date + INTERVAL '30 days', 'YYYY-MM-DD'),
        'medicalLaplExpiry',   NULL,
        'setBy',               'k1mnimda',
        'changedAt',           to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    )],
    ARRAY['{}'::jsonb],
    ARRAY['1'],
    ARRAY['InstructorQualificationSet'],
    ARRAY['E'],
    'instructor-qualification:Jukka1',
    'instructor',
    NULL,
    'emt:default'
);

-- ─── Antti1 — Antti Heikkinen (INSTRUCTOR) ───────────────────────────────────
-- FI    : +0  d  (expires today, red)
-- IRI   : +30 d
-- CRI   : NULL
-- SEP   : +15 d
-- MED I : +30 d
-- MED II: NULL
-- LAPL  : +0  d  (expires today, red)
SELECT emt_append_to_stream(
    ARRAY[gen_random_uuid()::text],
    ARRAY[jsonb_build_object(
        'memberId',            'Antti1',
        'fiExpiry',            to_char(current_date, 'YYYY-MM-DD'),
        'iriExpiry',           to_char(current_date + INTERVAL '30 days', 'YYYY-MM-DD'),
        'criExpiry',           NULL,
        'sepExpiry',           to_char(current_date + INTERVAL '15 days', 'YYYY-MM-DD'),
        'medicalClass1Expiry', to_char(current_date + INTERVAL '30 days', 'YYYY-MM-DD'),
        'medicalClass2Expiry', NULL,
        'medicalLaplExpiry',   to_char(current_date, 'YYYY-MM-DD'),
        'setBy',               'k1mnimda',
        'changedAt',           to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    )],
    ARRAY['{}'::jsonb],
    ARRAY['1'],
    ARRAY['InstructorQualificationSet'],
    ARRAY['E'],
    'instructor-qualification:Antti1',
    'instructor',
    NULL,
    'emt:default'
);

-- ─── Examiner1 — Exe McExaminerface (EXAMINER) ───────────────────────────────
-- FI    : +15 d
-- IRI   : +15 d
-- CRI   : +30 d
-- SEP   : +0  d  (expires today, red)
-- MED I : NULL
-- MED II: +15 d
-- LAPL  : NULL
SELECT emt_append_to_stream(
    ARRAY[gen_random_uuid()::text],
    ARRAY[jsonb_build_object(
        'memberId',            'Examiner1',
        'fiExpiry',            to_char(current_date + INTERVAL '15 days', 'YYYY-MM-DD'),
        'iriExpiry',           to_char(current_date + INTERVAL '15 days', 'YYYY-MM-DD'),
        'criExpiry',           to_char(current_date + INTERVAL '30 days', 'YYYY-MM-DD'),
        'sepExpiry',           to_char(current_date, 'YYYY-MM-DD'),
        'medicalClass1Expiry', NULL,
        'medicalClass2Expiry', to_char(current_date + INTERVAL '15 days', 'YYYY-MM-DD'),
        'medicalLaplExpiry',   NULL,
        'setBy',               'k1mnimda',
        'changedAt',           to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    )],
    ARRAY['{}'::jsonb],
    ARRAY['1'],
    ARRAY['InstructorQualificationSet'],
    ARRAY['E'],
    'instructor-qualification:Examiner1',
    'instructor',
    NULL,
    'emt:default'
);
