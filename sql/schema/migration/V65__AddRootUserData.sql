INSERT INTO member.register (
    member_id,
    first_name,
    last_name,
    member_since,
    email,
    member_type_id,
    can_make_reservations,
    is_training_program_pilot,
    created_by,
    updated_by

) VALUES
(
    0,
    'MIK',
    'Admin',
    CURRENT_DATE,
    'admin@mik.fi',
    'FLYING',
    TRUE,
    FALSE,
    0,
    0
);
