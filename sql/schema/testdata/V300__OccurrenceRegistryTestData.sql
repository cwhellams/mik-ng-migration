-- Occurrences for the printable occurrence register (#519).
--
-- The register is the annual Traficom attachment, so what it needs in dev data is
-- reports at every stage the safety manager can print, across a whole calendar
-- year, with both DTO and non-DTO reports:
--
--   SMS5_CLOS  DTO,     CLOSED     — fully handled: risk ratings before and after,
--                                    forwarded to Traficom, mitigating action, comments
--   SMS6_PROC  non-DTO, PROCESSED  — rated but still open, not forwarded to Traficom
--   SMS7_ANON  DTO,     ANONYMIZED — in the register, but nothing assessed yet, and
--                                    no aircraft involved
--
-- Each of the three is an anonymized copy of a RECEIVED original, the way the
-- RECEIVED transition creates them, so the register can be checked to list one row
-- per event rather than both halves of the pair.
--
-- The stages the register must *exclude* are already seeded by
-- V160__OccurrenceData.sql: SMS1_NEW (NEW) and SMS4_ANON (ANONYMIZING) still hold
-- the reporter's own words and belong to the independent processor alone.
--
-- notified_status is deliberately left at its NULL default, matching V160: the
-- occurrence notification worker test resets that column for every SMS% row in its
-- afterEach, so a value seeded here would only hold until the first time that
-- suite ran, making the worker's expected mail count differ between a freshly
-- baselined database and a re-run.

INSERT INTO flight.occurrences (
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
    -- 1. Original of the closed DTO report — locked and readonly since it was received.
    (
        'SMS5_RECE',
        'RECEIVED',
        '2026-03-14T07:20:00+00',
        '2026-03-14T09:05:00+00',
        NULL,
        'Bird strike on final approach with a student pilot',
        'EFNU final approach runway 22',
        'A flock of gulls crossed the approach path and one hit the propeller spinner. '
            || 'My student was flying and I took over the controls for the landing. '
            || 'Jukka Nieminen, instructor.',
        '["BIRD"]'::jsonb,
        FALSE,
        'OH-STL',
        FALSE,
        'EFNU',
        'EFNU',
        TRUE,
        NULL,
        json_build_array(
            json_build_object('status', 'NEW', 'at', '2026-03-14T09:05:00Z', 'by', 'Author', 'comment', NULL),
            json_build_object('status', 'RECEIVED', 'at', '2026-03-14T11:00:00Z', 'by', 'Korhonen', 'comment', NULL)
        ),
        json_build_object(),
        '2026-03-14T09:05:00+00',
        '2026-03-14T11:00:00+00',
        'Jukka1',
        'Liisa1'
    ),
    -- 2. Original of the processed non-DTO report.
    (
        'SMS6_RECE',
        'RECEIVED',
        '2026-05-02T11:05:00+00',
        '2026-05-02T18:40:00+00',
        NULL,
        'Left tank fuel quantity indication dropped to zero in the cruise',
        'EFNU-EFHK enroute, 2500 ft',
        'The left tank gauge read zero for roughly ten seconds and then recovered. '
            || 'Kaisa Laine, PIC.',
        '["SCF-NP"]'::jsonb,
        FALSE,
        'OH-IHQ',
        TRUE,
        'EFNU',
        'EFHK',
        FALSE,
        NULL,
        json_build_array(
            json_build_object('status', 'NEW', 'at', '2026-05-02T18:40:00Z', 'by', 'Author', 'comment', NULL),
            json_build_object('status', 'RECEIVED', 'at', '2026-05-03T07:10:00Z', 'by', 'Koskinen', 'comment', NULL)
        ),
        json_build_object(),
        '2026-05-02T18:40:00+00',
        '2026-05-03T07:10:00+00',
        'Kaisa1',
        'Sanna1'
    ),
    -- 3. Original of the report the safety manager has not looked at yet.
    (
        'SMS7_RECE',
        'RECEIVED',
        '2026-06-11T05:40:00+00',
        '2026-06-11T06:15:00+00',
        NULL,
        'Fuel bowser left unchocked on the apron slope',
        'EFNU apron, fuel pumps',
        'I found the bowser standing unchocked on the slope next to the pumps. '
            || 'Teemu Kinnunen.',
        '["RAMP", "SEC"]'::jsonb,
        FALSE,
        NULL,
        NULL,
        NULL,
        NULL,
        TRUE,
        NULL,
        json_build_array(
            json_build_object('status', 'NEW', 'at', '2026-06-11T06:15:00Z', 'by', 'Author', 'comment', NULL),
            json_build_object('status', 'RECEIVED', 'at', '2026-06-11T08:00:00Z', 'by', 'Korhonen', 'comment', NULL)
        ),
        json_build_object(),
        '2026-06-11T06:15:00+00',
        '2026-06-11T08:00:00+00',
        'Teemu1',
        'Liisa1'
    ),
    -- The anonymized copy: the description has been rewritten by the independent
    -- processor, which is the wording the register prints.
    (
        'SMS5_CLOS',
        'CLOSED',
        '2026-03-14T07:20:00+00',
        '2026-03-14T09:05:00+00',
        '2026-03-20T12:00:00+00',
        'Bird strike on final approach during a training flight',
        'EFNU final approach runway 22',
        'A flock of gulls crossed the approach path on final and one bird struck the '
            || 'propeller spinner. The instructor took over the controls and the aircraft '
            || 'landed normally. No damage was found on the post-flight inspection.',
        '["BIRD"]'::jsonb,
        FALSE,
        'OH-STL',
        FALSE,
        'EFNU',
        'EFNU',
        TRUE,
        'SMS5_RECE',
        json_build_array(
            json_build_object('status', 'NEW', 'at', '2026-03-14T09:05:00Z', 'by', 'Author', 'comment', NULL),
            json_build_object('status', 'ANONYMIZING', 'at', '2026-03-14T11:00:00Z', 'by', 'Korhonen', 'comment', NULL),
            json_build_object('status', 'ANONYMIZED', 'at', '2026-03-15T09:30:00Z', 'by', 'Korhonen', 'comment', NULL),
            json_build_object('status', NULL, 'at', '2026-03-16T10:00:00Z', 'by', 'Virtanen', 'comment',
                'Propeller and spinner inspected by the maintenance organisation, no damage found.'),
            json_build_object('status', 'PROCESSED', 'at', '2026-03-17T08:00:00Z', 'by', 'Virtanen', 'comment', NULL),
            json_build_object('status', NULL, 'at', '2026-03-19T14:20:00Z', 'by', 'Nieminen', 'comment',
                'Bird activity around the pumps discussed at the instructor meeting.'),
            json_build_object('status', 'CLOSED', 'at', '2026-03-20T12:00:00Z', 'by', 'Virtanen', 'comment', NULL)
        ),
        json_build_object(
            'processed', json_build_object(
                'adversity', 4,
                'probability', 3,
                'forwardedToTraficom', TRUE,
                'at', '2026-03-17T08:00:00Z',
                'by', 'Virtanen'
            ),
            'closed', json_build_object(
                'adversity', 2,
                'probability', 2,
                'mitigatingAction', 'Bird scaring round added to the morning apron check, and '
                    || 'the grass between the runway and the apron is now cut every second week '
                    || 'during the nesting season.',
                'at', '2026-03-20T12:00:00Z',
                'by', 'Virtanen'
            )
        ),
        '2026-03-14T11:00:00+00',
        '2026-03-20T12:00:00+00',
        'Liisa1',
        'Matti1'
    ),
    (
        'SMS6_PROC',
        'PROCESSED',
        '2026-05-02T11:05:00+00',
        '2026-05-02T18:40:00+00',
        '2026-05-06T09:00:00+00',
        'Left tank fuel quantity indication dropped to zero in the cruise',
        'EFNU-EFHK enroute, 2500 ft',
        'The left tank fuel quantity indication read zero for approximately ten seconds '
            || 'in the cruise and then returned to a plausible value. The flight was '
            || 'continued to destination with the right tank selected.',
        '["SCF-NP"]'::jsonb,
        FALSE,
        'OH-IHQ',
        TRUE,
        'EFNU',
        'EFHK',
        FALSE,
        'SMS6_RECE',
        json_build_array(
            json_build_object('status', 'NEW', 'at', '2026-05-02T18:40:00Z', 'by', 'Author', 'comment', NULL),
            json_build_object('status', 'ANONYMIZING', 'at', '2026-05-03T07:10:00Z', 'by', 'Koskinen', 'comment', NULL),
            json_build_object('status', 'ANONYMIZED', 'at', '2026-05-04T18:00:00Z', 'by', 'Koskinen', 'comment',
                'Aircraft type kept in the report, the fault is type specific.'),
            json_build_object('status', NULL, 'at', '2026-05-05T11:30:00Z', 'by', 'Virtanen', 'comment',
                'Sender resistance measured by the maintenance organisation, within limits. Watch item.'),
            json_build_object('status', 'PROCESSED', 'at', '2026-05-06T09:00:00Z', 'by', 'Virtanen', 'comment', NULL)
        ),
        json_build_object(
            'processed', json_build_object(
                'adversity', 3,
                'probability', 2,
                'forwardedToTraficom', FALSE,
                'at', '2026-05-06T09:00:00Z',
                'by', 'Virtanen'
            )
        ),
        '2026-05-03T07:10:00+00',
        '2026-05-06T09:00:00+00',
        'Sanna1',
        'Matti1'
    ),
    (
        'SMS7_ANON',
        'ANONYMIZED',
        '2026-06-11T05:40:00+00',
        '2026-06-11T06:15:00+00',
        NULL,
        'Fuel bowser left unchocked on the apron slope',
        'EFNU apron, fuel pumps',
        'A fuel bowser was found standing unchocked on the sloping part of the apron '
            || 'next to the pumps, with no attendant present.',
        '["RAMP", "SEC"]'::jsonb,
        FALSE,
        NULL,
        NULL,
        NULL,
        NULL,
        TRUE,
        'SMS7_RECE',
        json_build_array(
            json_build_object('status', 'NEW', 'at', '2026-06-11T06:15:00Z', 'by', 'Author', 'comment', NULL),
            json_build_object('status', 'ANONYMIZING', 'at', '2026-06-11T08:00:00Z', 'by', 'Korhonen', 'comment', NULL),
            json_build_object('status', 'ANONYMIZED', 'at', '2026-06-12T09:00:00Z', 'by', 'Korhonen', 'comment', NULL)
        ),
        json_build_object(),
        '2026-06-11T08:00:00+00',
        '2026-06-12T09:00:00+00',
        'Liisa1',
        'Liisa1'
    );

-- Both halves of a pair point at each other, as the RECEIVED transition leaves them.
UPDATE flight.occurrences SET linked_report_id = 'SMS5_CLOS' WHERE report_id = 'SMS5_RECE';
UPDATE flight.occurrences SET linked_report_id = 'SMS6_PROC' WHERE report_id = 'SMS6_RECE';
UPDATE flight.occurrences SET linked_report_id = 'SMS7_ANON' WHERE report_id = 'SMS7_RECE';

-- Access mirrors what the workflow grants: on the original the author keeps read
-- access and the independent processor manages it; on the anonymized copy the
-- processor's grant is replaced by the safety manager's.
INSERT INTO flight.occurrence_access (
        report_id,
        member_id,
        role_id,
        author,
        write_access,
        manage_access,
        updated_by
    )
VALUES
    ('SMS5_RECE', 'Jukka1', NULL,            TRUE,  FALSE, FALSE, 'k1mnimda'),
    ('SMS5_RECE', NULL,     'SMS_PROCESSOR', FALSE, FALSE, TRUE,  'k1mnimda'),
    ('SMS6_RECE', 'Kaisa1', NULL,            TRUE,  FALSE, FALSE, 'k1mnimda'),
    ('SMS6_RECE', NULL,     'SMS_PROCESSOR', FALSE, FALSE, TRUE,  'k1mnimda'),
    ('SMS7_RECE', 'Teemu1', NULL,            TRUE,  FALSE, FALSE, 'k1mnimda'),
    ('SMS7_RECE', NULL,     'SMS_PROCESSOR', FALSE, FALSE, TRUE,  'k1mnimda'),

    ('SMS5_CLOS', 'Jukka1', NULL,            TRUE,  FALSE, FALSE, 'k1mnimda'),
    ('SMS5_CLOS', NULL,     'SMS_MANAGER',   FALSE, TRUE,  TRUE,  'k1mnimda'),
    ('SMS6_PROC', 'Kaisa1', NULL,            TRUE,  FALSE, FALSE, 'k1mnimda'),
    ('SMS6_PROC', NULL,     'SMS_MANAGER',   FALSE, TRUE,  TRUE,  'k1mnimda'),
    ('SMS7_ANON', 'Teemu1', NULL,            TRUE,  FALSE, FALSE, 'k1mnimda'),
    ('SMS7_ANON', NULL,     'SMS_MANAGER',   FALSE, TRUE,  TRUE,  'k1mnimda');
