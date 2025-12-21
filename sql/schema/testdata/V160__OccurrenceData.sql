
insert into flight.occurrences (
        report_id,
        status,
        occurrence_date,
        report_date,
        processed_date,
        headline,
        location,
        description,
        categories,
        is_weather_relevant,
        animal_number,
        animal_size,
        animal_species,
        registration,
        departure_airport,
        arrival_airport,
        is_dto_report,
        linked_report_id,
        comments,
        handling,
        created_at,
        updated_at,
        created_by,
        updated_by
    )
VALUES (
        'SMS1_NEW',
        'NEW',
        '2025-12-01T10:30:00+00',
        CURRENT_TIMESTAMP + MAKE_INTERVAL(HOURS => -30),
        NULL,
        'Kiwistrike at Nummela',
        'EFNU Final approach 22',
        'Flock of kiwis hit the propeller on final.',
        '["BIRD", "WILD"]'::jsonb,
        TRUE,
        '100+',
        'S',
        'Kiwi',
        'OH-STL',
        'EFNU',
        'EFNU',
        FALSE,
        NULL,
        json_build_array(),
        json_build_object(),
        NOW()::timestamp(0),
        NOW()::timestamp(0),
        'Matti1',
        'Matti1'
    ),
    (
        'SMS2_RECE',
        'RECEIVED',
        '2025-12-02T10:30:00+00',
        '2025-12-02T12:30:00+00',
        NULL,
        'Moose at Nummela',
        'EFNU Final approach 22',
        'Moose ate the strobo light of left wing.',
        '["WILD"]'::jsonb,
        TRUE,
        '1',
        'L',
        'Moose',
        'OH-STL',
        'EFNU',
        'EFNU',
        FALSE,
        NULL,
        json_build_array(
            json_build_object(
                'status', 'RECEIVED',
                'at', '2025-12-02T13:00:00Z',
                'by', 'Liisa1'
            )
        ),
        json_build_object(),
        NOW()::timestamp(0),
        NOW()::timestamp(0),
        'Liisa1',
        'Liisa1'
    ),
    (
        'SMS3_RECE',
        'RECEIVED',
        '2025-12-04T10:30:00+00',
        '2025-12-04T10:30:00+00',
        NULL,
        'Pelican hit the turbine',
        'EFNU Final approach 22',
        'Pelican hit the turbine.',
        '["WILD"]'::jsonb,
        '1',
        'L',
        'Pelican',
        null,
        'OH-STL',
        'EFNU',
        'EFNU',
        FALSE,
        NULL,
        json_build_array(
            json_build_object(
                'status', 'RECEIVED',
                'at', '2025-12-04T15:00:00Z',
                'by', 'Liisa1'
            )
        ),
        json_build_object(),
        NOW()::timestamp(0),
        NOW()::timestamp(0),
        'Matti1',
        'Matti1'
    ),
    (
        'SMS4_RECE',
        'RECEIVED',
        '2025-12-03T13:30:00+00',
        '2025-12-03T13:30:00+00',
        NULL,
        'Known Flying Animal at Nummela',
        'EFNU Final approach 22',
        'I did it again.',
        '["WILD"]'::jsonb,
        TRUE,
        '0',
        'L',
        'Unknown',
        'OH-STL',
        'EFNU',
        'EFNU',
        FALSE,
        NULL,
        json_build_array(
            json_build_object(
                'status', 'RECEIVED',
                'at', '2025-12-02T15:00:00Z',
                'by', 'Liisa1'
            )
        ),
        json_build_object(),
        NOW()::timestamp(0) + MAKE_INTERVAL(HOURS => 1),
        NOW()::timestamp(0) + MAKE_INTERVAL(HOURS => 1),
        'Liisa1',
        'Liisa1'
    );


insert into flight.occurrences (
        report_id,
        status,
        occurrence_date,
        report_date,
        processed_date,
        headline,
        location,
        description,
        categories,
        is_weather_relevant,
        animal_number,
        animal_size,
        animal_species,
        registration,
        technical_faults,
        departure_airport,
        arrival_airport,
        is_dto_report,
        linked_report_id,
        comments,
        handling,
        created_at,
        updated_at,
        created_by,
        updated_by
    )
VALUES 
    (
        'SMS2_ANON',
        'ANONYMIZED',
        '2025-12-02T10:30:00+00',
        '2025-12-02T12:30:00+00',
        NULL,
        'Animal at Nummela',
        'EFNU Final approach 22',
        'Unknown animal ate the strobo light of left wing.',
        '["WILD"]'::jsonb,
        TRUE,
        '0',
        'L',
        'Unknown',
        'OH-STL',
        TRUE,
        'EFNU',
        'EFNU',
        FALSE,
        'SMS2_RECE',
        json_build_array(
            json_build_object(
                'status', 'RECEIVED',
                'at', '2025-12-02T15:00:00Z',
                'by', 'Liisa1'
            ),
            json_build_object(
                'status', 'ANONYMIZED',
                'at', '2025-12-02T15:30:00Z',
                'by', 'Liisa1'
            )
        ),
        json_build_object(
            'before', json_build_object(
                'adversity', 4,
                'probability', 4,
                'forwardedToTraficom', true
            ),
            'comments', json_build_array(
                json_build_object(
                    'text', 'Add fence around the airfield',
                    'at', '2025-12-02T16:00:00Z',
                    'by', 'Liisa1'
                )
            )
        ),
        NOW()::timestamp(0) + MAKE_INTERVAL(HOURS => 1),
        NOW()::timestamp(0) + MAKE_INTERVAL(HOURS => 1),
        'Liisa1',
        'Liisa1'
    ),
    (
        'SMS3_CLOS',
        'CLOSED',
        '2025-12-04T10:30:00+00',
        '2025-12-04T10:30:00+00',
        '2025-12-04T16:00:00Z',
        'Pelican hit the turbine',
        'EFNU Final approach 22',
        'Pelican hit the turbine.',
        '["WILD"]'::jsonb,
        '1',
        'L',
        'Pelican',
        null,
        'OH-STL',
        FALSE,
        'EFNU',
        'EFNU',
        FALSE,
        'SMS3_RECE',
        json_build_array(
            json_build_object(
                'status', 'RECEIVED',
                'at', '2025-12-04T15:00:00Z',
                'by', 'Liisa1'
            ),
            json_build_object(
                'status', 'ANONYMIZED',
                'at', '2025-12-04T15:30:00Z',
                'by', 'Liisa1'
            ),
            json_build_object(
                'status', 'PROCESSED',
                'at', '2025-12-04T16:00:00Z',
                'by', 'Liisa1'
            ),
            json_build_object(
                'status', 'CLOSED',
                'at', '2025-12-04T17:30:00Z',
                'by', 'Liisa1'
            )
        ),
        json_build_object(
            'before', json_build_object(
                'adversity', 4,
                'probability', 4,
                'forwardedToTraficom', true
            ),
            'comments', json_build_array(
                json_build_object(
                    'text', 'Add second engine',
                    'at', '2025-12-04T16:00:00Z',
                    'by', 'Liisa1'
                ),
                json_build_object(
                    'text', 'Second engine added',
                    'at', '2025-12-04T17:00:00Z',
                    'by', 'Matti1'
                )
            ),
            'after', json_build_object(
                'adversity', 1,
                'probability', 1,
                'mitigatingAction', 'Second engine added'
            )
        ),
        NOW()::timestamp(0),
        NOW()::timestamp(0),
        'Matti1',
        'Matti1'
    ),
    (
        'SMS4_ANON',
        'ANONYMIZING',
        '2025-12-03T13:30:00+00',
        '2025-12-03T13:30:00+00',
        NULL,
        'Unknown Flying Animal at Nummela',
        'EFNU Final approach 22',
        'Somebody did it again.',
        '["WILD"]'::jsonb,
        TRUE,
        '0',
        'L',
        'Unknown',
        'OH-STL',
        FALSE,
        'EFNU',
        'EFNU',
        FALSE,
        'SMS4_RECE',
        json_build_array(
            json_build_object(
                'status', 'RECEIVED',
                'at', '2025-12-02T15:00:00Z',
                'by', 'Liisa1'
            ),
            json_build_object(
                'status', 'ANONYMIZING',
                'at', '2025-12-02T16:00:00Z',
                'by', 'Liisa1'
            )
        ),
        json_build_object(),
        NOW()::timestamp(0) + MAKE_INTERVAL(HOURS => 1),
        NOW()::timestamp(0) + MAKE_INTERVAL(HOURS => 1),
        'Liisa1',
        'Liisa1'
    )
;

UPDATE flight.occurrences
SET linked_report_id = 'SMS2_ANON'
WHERE report_id = 'SMS2_RECE';

UPDATE flight.occurrences
SET linked_report_id = 'SMS3_CLOS'
WHERE report_id = 'SMS3_RECE';

UPDATE flight.occurrences
SET linked_report_id = 'SMS4_ANON'
WHERE report_id = 'SMS4_RECE';


INSERT INTO flight.occurrence_access (report_id, 
    member_id, 
    role_id, 
    author,
    write_access, 
    manage_access,
    updated_by)
VALUES
    ('SMS1_NEW', 'Matti1', NULL,        TRUE, TRUE, TRUE, 'k1mnimda'),
    ('SMS1_NEW', NULL, 'SMS_PROCESSOR', FALSE, FALSE, TRUE, 'k1mnimda'),
    ('SMS2_RECE', 'Matti1', NULL,        TRUE, FALSE, FALSE, 'k1mnimda'),
    ('SMS2_RECE', NULL, 'SMS_PROCESSOR', FALSE, FALSE, TRUE, 'k1mnimda'),
    ('SMS3_RECE', 'Matti1', NULL,        TRUE, FALSE, FALSE, 'k1mnimda'),
    ('SMS3_RECE', NULL, 'SMS_PROCESSOR', FALSE, FALSE, TRUE, 'k1mnimda'),
    ('SMS4_RECE', 'Liisa1', NULL,        TRUE, FALSE, FALSE, 'k1mnimda'),
    ('SMS4_RECE', NULL, 'SMS_PROCESSOR', FALSE, FALSE, TRUE, 'k1mnimda'),

    ('SMS2_ANON', 'Matti1', NULL,        TRUE, FALSE, FALSE, 'k1mnimda'),
    ('SMS2_ANON', NULL, 'SMS_MANAGER',  FALSE, TRUE, TRUE, 'k1mnimda'),
    ('SMS3_CLOS', 'Matti1', NULL,       TRUE, FALSE, FALSE, 'k1mnimda'),
    ('SMS3_CLOS', NULL, 'SMS_MANAGER',  FALSE, TRUE, TRUE, 'k1mnimda'),
    ('SMS4_ANON', 'Liisa1', NULL,       TRUE, FALSE, FALSE, 'k1mnimda'),
    ('SMS4_ANON', NULL, 'SMS_PROCESSOR', FALSE, TRUE, TRUE, 'k1mnimda');