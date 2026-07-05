CREATE TABLE accts.expense_category (
    id SERIAL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    label_en TEXT NOT NULL,
    label_fi TEXT NOT NULL,
    label_sv TEXT NOT NULL,
    requires_aircraft BOOLEAN NOT NULL DEFAULT FALSE,
    requires_flight BOOLEAN NOT NULL DEFAULT FALSE,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO accts.expense_category (
    code,
    label_en,
    label_fi,
    label_sv,
    requires_aircraft,
    requires_flight
)
VALUES
    ('fuel', 'Fuel', 'Polttoaine', 'Bränsle', TRUE, FALSE),
    ('mileage', 'Mileage (km)', 'Kilometrikorvaus', 'Kilometerersättning', FALSE, FALSE),
    ('travel', 'Bus/Train/Flight ticket', 'Matkalippu', 'Resebiljett', FALSE, FALSE),
    ('misc', 'Miscellaneous', 'Sekalainen', 'Diverse', FALSE, FALSE),
    ('aircraft_supplies', 'Aircraft supplies', 'Konehankinnat', 'Flygplatstillbehör', TRUE, FALSE),
    ('web', 'Web / Hosting', 'Web / Hosting', 'Webb / Hosting', FALSE, FALSE)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE accts.expense_claim (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id TEXT NOT NULL REFERENCES member.register (member_id),
    category_id INT NOT NULL REFERENCES accts.expense_category (id),
    aircraft_id TEXT REFERENCES flight.aircraft (registration),
    flight_log_id TEXT,
    title TEXT NOT NULL,
    expense_date DATE,
    ccy VARCHAR(3) NOT NULL DEFAULT 'EUR',
    fx_rate NUMERIC(18, 6) NULL,
    iban TEXT,
    iban_account_name TEXT,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    fuel_litres DECIMAL(8, 2),
    fuel_type TEXT,
    submitted_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    approved_by TEXT REFERENCES member.register (member_id),
    rejected_at TIMESTAMPTZ,
    rejected_by TEXT REFERENCES member.register (member_id),
    rejection_reason TEXT,
    simplbooks_purchase_id BIGINT,
    receipt_storage_key TEXT NULL,
    receipt_file_name   TEXT NULL,
    receipt_file_size   BIGINT NULL,
    receipt_mime_type   TEXT NULL,
    receipt_uploaded_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE accts.expense_claim_line_item (
    id SERIAL PRIMARY KEY,
    claim_id UUID NOT NULL REFERENCES accts.expense_claim (id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity DECIMAL(10, 3) NOT NULL DEFAULT 1,
    unit TEXT NOT NULL DEFAULT 'pcs',
    unit_price DECIMAL(10, 2) NOT NULL,
    vat_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
    sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE accts.expense_claim_message (
    id SERIAL PRIMARY KEY,
    claim_id UUID NOT NULL REFERENCES accts.expense_claim (id) ON DELETE CASCADE,
    sender_id TEXT NOT NULL REFERENCES member.register (member_id),
    message_type TEXT NOT NULL,
    body TEXT NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
