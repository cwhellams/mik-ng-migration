CREATE TABLE member.register
(
    member_id VARCHAR(9) PRIMARY KEY,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    date_of_birth DATE,
    member_since DATE NOT NULL DEFAULT CURRENT_DATE,
    email VARCHAR(100) UNIQUE NOT NULL,
    phone_number VARCHAR(20),
    ice_contact_name VARCHAR(100),
    ice_contact_phone_number VARCHAR(20),
    member_type MEMBER_TYPE NOT NULL,
    billing_id VARCHAR(50),
    street_address VARCHAR(255),
    town_city VARCHAR(100),
    postcode VARCHAR(20),
    can_make_reservations BOOLEAN NOT NULL DEFAULT FALSE,
    is_training_program_pilot BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    email_verified_at TIMESTAMP,
    created_by VARCHAR(9) NOT NULL REFERENCES member.register (member_id),
    updated_by VARCHAR(9) NOT NULL REFERENCES member.register (member_id)
);
