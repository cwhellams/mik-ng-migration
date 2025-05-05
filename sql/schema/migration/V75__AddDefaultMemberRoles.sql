INSERT INTO member.roles (
    role_id,
    description,
    name_en,
    name_fi,
    is_public,
    permissions,
    created_by,
    updated_by
)
VALUES
(
    'ADMIN',
    'Administrator with full access',
    'Administrator',
    'Ylläpitäjä',
    FALSE,
    to_jsonb(
        ARRAY[
            'member.admin', 'flightlog.admin', 'booking.admin', 'aircraft.admin'
        ]
    ),
    'k1mnimda',
    'k1mnimda'
),
(
    'SERVICE',
    'Service user',
    'Service User',
    'Service User',
    FALSE,
    NULL,
    'k1mnimda',
    'k1mnimda'
),
(
    'MEMBER',
    'MIK member with basic access',
    'Member',
    'Jäsen',
    TRUE,
    to_jsonb(ARRAY['member']),
    'k1mnimda',
    'k1mnimda'
),
(
    'FLYING_MEMBER',
    'MIK member with additional flying rights',
    'Flying Member',
    'Lento-oikeus',
    FALSE,
    to_jsonb(ARRAY['flightlog.user', 'booking.user', 'aircraft.user']),
    'k1mnimda',
    'k1mnimda'
),
(
    'COMMITTEE',
    'MIK board member with decision-making authority in the club',
    'Committee Member',
    'Hallituksen jäsen',
    TRUE,
    to_jsonb(ARRAY[]::varchar []),
    'k1mnimda',
    'k1mnimda'
),
(
    'SECRETARY',
    'MIK board member managing members and billing',
    'Secretary',
    'Sihteeri',
    TRUE,
    to_jsonb(ARRAY['member.admin', 'flightlog.admin']),
    'k1mnimda',
    'k1mnimda'
),
(
    'PLANE_CAPTAIN',
    'MIK board member looking after our planes',
    'Plane Captain',
    'Kalustovastaava',
    TRUE,
    to_jsonb(ARRAY['flightlog.admin', 'booking.admin', 'aircraft.admin']),
    'k1mnimda',
    'k1mnimda'
),
(
    'MAINTENANCE',
    'External service center user can log in and see flight logs and plane hours',
    'Maintenance',
    'Huolto',
    FALSE,
    to_jsonb(ARRAY['flightlog.user', 'aircraft.user']),
    'k1mnimda',
    'k1mnimda'
),
(
    'INSTRUCTOR',
    'Instructor with permissions to manage training',
    'Instructor',
    'Lennonopettaja',
    TRUE,
    to_jsonb(ARRAY[]::varchar []),
    'k1mnimda',
    'k1mnimda'
),
(
    'EXAMINER',
    'Flight examiner is certified to conduct a skill test, proficiency check or an assessment of competence',
    'Examiner',
    'Tarkastuslentäjä',
    TRUE,
    to_jsonb(ARRAY[]::varchar []),
    'k1mnimda',
    'k1mnimda'
);
