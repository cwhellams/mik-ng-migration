update member.register
set membership_approved_at = current_timestamp,
    membership_approved_by = 'Matti1',
    email_verified_at = current_timestamp
where member_id in (
        'Liisa1',
        'Jukka1',
        'Matti1',
        'Pekka1',
        'Antti1',
        'Sanna1',
        'John1'
    );