ALTER TABLE member.register
    ADD COLUMN must_update_profile BOOLEAN NOT NULL DEFAULT FALSE;
