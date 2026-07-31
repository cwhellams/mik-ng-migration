-- ============================================================
-- V250__AmeListTestData
--
-- Test data for exercising PR #1014 (AME directory with member
-- submission and admin approval): entries across every status
-- (SUBMITTED, APPROVED, REJECTED) and medical type.
-- ============================================================

INSERT INTO club.ame_list (
        submitted_by, name, medical_centre, location, price,
        medical_types, notes, report_date, status,
        approved_at, approved_by, rejected_at, rejected_by, rejection_reason,
        created_at, updated_at
    )
VALUES (
        'Matti1', 'Dr. Pekka Virtanen', 'Helsinki Aviation Medical Centre', 'Helsinki-Malmi',
        180.00, '{EASA_CLASS_1,EASA_CLASS_2}', 'Fast appointment availability, English spoken',
        CURRENT_DATE - INTERVAL '10 days', 'APPROVED',
        NOW() - INTERVAL '9 days', 'Liisa1', NULL, NULL, NULL,
        NOW() - INTERVAL '10 days', NOW() - INTERVAL '9 days'
    ),
    (
        'Liisa1', 'Dr. Anneli Korhonen', 'Turku AME Clinic', 'Turku',
        150.00, '{LAPL}', 'Good for LAPL renewals, quick turnaround',
        CURRENT_DATE - INTERVAL '20 days', 'APPROVED',
        NOW() - INTERVAL '18 days', 'Liisa1', NULL, NULL, NULL,
        NOW() - INTERVAL '20 days', NOW() - INTERVAL '18 days'
    ),
    (
        'Jukka1', 'Dr. Timo Laine', 'Tampere Flight Medicine', 'Tampere-Pirkkala',
        NULL, '{EASA_CLASS_2,LAPL}', NULL,
        CURRENT_DATE - INTERVAL '2 days', 'SUBMITTED',
        NULL, NULL, NULL, NULL, NULL,
        NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'
    ),
    (
        'Anna1', 'Dr. Sari Nieminen', 'Vantaa Aeromedical', 'Helsinki-Vantaa',
        220.00, '{EASA_CLASS_1}', 'Popular with commercial students, book well in advance',
        CURRENT_DATE - INTERVAL '1 days', 'SUBMITTED',
        NULL, NULL, NULL, NULL, NULL,
        NOW() - INTERVAL '1 days', NOW() - INTERVAL '1 days'
    ),
    (
        'Matti1', 'Dr. FAA Contact (outdated)', 'Old Address Clinic', 'Espoo',
        100.00, '{FAA}', 'Clinic has since closed, address no longer valid',
        CURRENT_DATE - INTERVAL '30 days', 'REJECTED',
        NULL, NULL, NOW() - INTERVAL '28 days', 'Liisa1', 'Clinic is permanently closed, please remove',
        NOW() - INTERVAL '30 days', NOW() - INTERVAL '28 days'
    );
