CREATE TABLE member.roles
(
    role_id VARCHAR(20) NOT NULL PRIMARY KEY,
    description TEXT,
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    permissions JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by INT NOT NULL REFERENCES member.register (member_id),
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by INT NOT NULL REFERENCES member.register (member_id)
);
