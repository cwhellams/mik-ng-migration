CREATE TABLE flight.flight_credits (
    flight_id VARCHAR(9) NOT NULL REFERENCES flight.logs(flight_id) ON DELETE CASCADE,
    credited_mins INTEGER NOT NULL CHECK (credited_mins > 0),
    note TEXT NULL,
    allocated_by_member_id VARCHAR(9) NOT NULL REFERENCES member.register(member_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pk_flight_credits PRIMARY KEY (flight_id)
);
