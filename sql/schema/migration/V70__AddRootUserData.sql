INSERT INTO member.register (
    member_id,
    first_name,
    last_name,
    member_since,
    email,
    member_type,
    can_make_reservations,
    is_training_program_pilot,
    created_by,
    updated_by

) VALUES
(
    'k1mnimda',
    'MIK',
    'Admin',
    CURRENT_DATE,
    'admin@mik.fi',
    'FLYING',
    TRUE,
    FALSE,
    'k1mnimda',
    'k1mnimda'
);
