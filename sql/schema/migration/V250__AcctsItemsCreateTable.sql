create table accts.Items (
	id int not null,
	code varchar(255) not null,
	name varchar(255) not null,
	item JSONB,
	constraint PK_accts_items primary key (id)
)