CREATE TABLE accts.recurring_fees_processing (
    fee_type fee_type NOT NULL,
    year smallint NOT NULL CHECK (
        year >= 2024
        AND year <= 2100
    ),
    status feeprocessstatus NOT NULL,
    created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by varchar(9) NOT NULL,
    updated_by varchar(9) NOT NULL,
    CONSTRAINT pk_recurring_fees_processing PRIMARY KEY (fee_type, year),
    CONSTRAINT fk_recurring_fees_created_by FOREIGN KEY (created_by) REFERENCES member.register (member_id),
    CONSTRAINT fk_recurring_fees_updated_by FOREIGN KEY (updated_by) REFERENCES member.register (member_id)
);