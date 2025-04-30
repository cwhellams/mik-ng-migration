CREATE TABLE accts.outbox_simplbooks (
    id uuid NOT NULL CONSTRAINT pk_outbox_simplbooks PRIMARY KEY,
    event_type varchar(255) NOT NULL,
    payload jsonb NOT NULL,
    created_at_utc timestamp with time zone NOT NULL DEFAULT now(),
    updated_at_utc timestamp with time zone NOT NULL DEFAULT now(),
    processed_at timestamp with time zone,
    status simplbooks_outbox_status NOT NULL DEFAULT 'PENDING',
    error_message text NULL
)
