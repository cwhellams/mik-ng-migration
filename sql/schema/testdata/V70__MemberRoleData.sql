INSERT INTO member.roles (
        role_id,
        description,
        name_en,
        name_fi,
        name_sv,
        is_public,
        permissions,
        created_by,
        updated_by
    )
VALUES (
        'SMS_REVIEWER',
        'SMS independent reviewer',
        'SMS independent reviewer',
        'SMS riippumaton tarkastaja',
        'SMS oberoende granskare',
        FALSE,
        to_jsonb(
            ARRAY [
            'sms.admin'

        ]
        ),
        'k1mnimda',
        'k1mnimda'
    );


INSERT INTO member.member_to_roles (member_id, role_id, created_by)
VALUES ('Matti1', 'MEMBER', 'k1mnimda'),
    ('Matti1', 'FLYING_MEMBER', 'k1mnimda'),
    ('Matti1', 'INSTRUCTOR', 'k1mnimda'),
    ('Liisa1', 'ADMIN', 'k1mnimda'),
    ('Liisa1', 'COMMITTEE', 'k1mnimda'),
    ('Liisa1', 'SMS_REVIEWER', 'k1mnimda'),
    ('Jukka1', 'INSTRUCTOR', 'k1mnimda'),
    ('Anna1', 'COMMITTEE', 'k1mnimda'),
    ('Pekka1', 'MEMBER', 'k1mnimda'),
    ('Pekka1', 'ADMIN', 'k1mnimda'),
    ('Kaisa1', 'ADMIN', 'k1mnimda'),
    ('Antti1', 'INSTRUCTOR', 'k1mnimda'),
    ('Antti1', 'MEMBER', 'k1mnimda'),
    ('Sanna1', 'COMMITTEE', 'k1mnimda'),
    ('Sanna1', 'SMS_REVIEWER', 'k1mnimda'),
    ('Juha1', 'MEMBER', 'k1mnimda'),
    ('John1', 'ADMIN', 'k1mnimda'),
    ('Examiner1', 'EXAMINER', 'k1mnimda');
