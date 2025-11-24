CREATE TABLE member.annual_fees (
    member_id varchar(9) NOT NULL,
    fee_type fee_type NOT NULL,
    year smallint NOT NULL CHECK (
        year >= 2024
        AND year <= 2100
    ),
    invoice_id integer NOT NULL,
    created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by varchar(9) NOT NULL,
    updated_by varchar(9) NOT NULL,
    CONSTRAINT fk_annual_fees_created_by FOREIGN KEY (created_by) REFERENCES member.register (member_id),
    CONSTRAINT fk_annual_fees_updated_by FOREIGN KEY (updated_by) REFERENCES member.register (member_id),
    CONSTRAINT fk_annual_fees_member FOREIGN KEY (member_id) REFERENCES member.register (member_id),
    CONSTRAINT fk_annual_fees_invoice FOREIGN KEY (member_id, invoice_id) REFERENCES accts.invoice (member_id, id),
    CONSTRAINT pk_annual_fees PRIMARY KEY (member_id, fee_type, year)
);