create table schedule.bookings (
	booking_id VARCHAR(9) NOT NULL CONSTRAINT pk_bookings PRIMARY KEY,
	member_id VARCHAR(9) NOT NULL REFERENCES member.register (member_id),
	registration VARCHAR(9) NOT NULL REFERENCES flight.aircraft(registration),
	booking_type public.booking_type NOT NULL,
	booking_status public.booking_status NOT NULL,
	start_time_epoch BIGINT NOT NULL,
	end_time_epoch BIGINT NOT NULL,
	description TEXT,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	created_by VARCHAR(9) NOT NULL REFERENCES member.register(member_id),
	updated_by VARCHAR(9) NOT NULL REFERENCES member.register(member_id),
	cancelled_at TIMESTAMP,
	cancelled_by VARCHAR(9) REFERENCES member.register(member_id),
	CONSTRAINT check_all_times_in_mins CHECK (
		start_time_epoch % 60 = 0
		AND end_time_epoch % 60 = 0
	),
	CONSTRAINT check_booking_time_sequence CHECK (start_time_epoch < end_time_epoch),
	CONSTRAINT cancelled_audit_check CHECK (
		booking_status = 'CANCELLED'
		AND cancelled_at IS NOT NULL
		AND cancelled_by IS NOT NULL
		OR booking_status != 'CANCELLED'
		AND cancelled_at IS NULL
		AND cancelled_by IS NULL
	),
	-- Computed columns to convert BIGINT timestamps to TIMESTAMPTZ
	start_time_utc TIMESTAMPTZ NOT NULL GENERATED ALWAYS AS (TO_TIMESTAMP(start_time_epoch)) STORED,
	end_time_utc TIMESTAMPTZ NOT NULL GENERATED ALWAYS AS (TO_TIMESTAMP(end_time_epoch)) STORED
)