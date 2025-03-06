CREATE TABLE member.register
(
    member_id SERIAL PRIMARY KEY,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    date_of_birth DATE NOT NULL,
    member_since DATE NOT NULL DEFAULT CURRENT_DATE,
    email VARCHAR(100) UNIQUE NOT NULL,
    phone_number VARCHAR(20),
    ice_contact_name VARCHAR(100),
    ice_contact_phone_number VARCHAR(20),
    member_type_id VARCHAR(10) NOT NULL,
    billing_id VARCHAR(50),
    street_address VARCHAR(255),
    town_city VARCHAR(100),
    postcode VARCHAR(20),
    can_make_reservations BOOLEAN NOT NULL DEFAULT TRUE,
    is_training_program_pilot BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_updated_by VARCHAR(50) NOT NULL,
    FOREIGN KEY (member_type_id) REFERENCES member.type (id)
);
