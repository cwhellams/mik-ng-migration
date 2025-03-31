CREATE TABLE member.member_to_roles
(
    member_id INT NOT NULL,
    role_id VARCHAR(10) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT NOT NULL,
    PRIMARY KEY (member_id, role_id),
    FOREIGN KEY (member_id) REFERENCES member.register (member_id),
    FOREIGN KEY (role_id) REFERENCES member.roles (role_id)
);
