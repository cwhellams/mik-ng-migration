CREATE TABLE static.airfields (
    ident VARCHAR(10) NOT NULL,
    name VARCHAR(255),
    iso_country CHAR(2),
    closed BOOLEAN,
    CONSTRAINT pk_airfields PRIMARY KEY (ident)
);
