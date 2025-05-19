create table accts.invoice (

	member_id VARCHAR(9) NOT NULL,
	id bigint not null,
	invoice_type invoice_type not null,
	description TEXT,
	total_sum NUMERIC(12, 2), 	
  	currency CHAR(3) DEFAULT 'EUR',
  	pmt_ref TEXT not null,
	sent_at DATE ,
	due_at DATE NOT NULL,
	paid_at DATE ,
	is_paid BOOLEAN GENERATED ALWAYS AS (paid_at IS NOT NULL) stored,
  	created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	created_by varchar(9) NOT NULL,
	updated_by varchar(9) NOT null,
	constraint PK_accts_invoice primary key (member_id,id),
	constraint register_member_id_fkey FOREIGN KEY (member_id) REFERENCES member.register(member_id),
	CONSTRAINT register_created_by_fkey FOREIGN KEY (created_by) REFERENCES member.register(member_id),
	CONSTRAINT register_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES "member".register(member_id)
)