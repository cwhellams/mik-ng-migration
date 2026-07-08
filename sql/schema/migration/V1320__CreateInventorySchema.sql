CREATE TYPE inventory.item_type AS ENUM ('ASSET', 'CONSUMABLE');
CREATE TYPE inventory.item_condition AS ENUM ('GOOD', 'FAIR', 'POOR', 'UNKNOWN');

CREATE TABLE inventory.locations (
    location_id  VARCHAR(9)   NOT NULL PRIMARY KEY,
    name         JSONB        NOT NULL,
    description  JSONB,
    is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
    sort_order   INTEGER      NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by   VARCHAR(9)   NOT NULL REFERENCES member.register(member_id),
    updated_by   VARCHAR(9)   NOT NULL REFERENCES member.register(member_id)
);

CREATE TABLE inventory.categories (
    category_id  VARCHAR(9)   NOT NULL PRIMARY KEY,
    name         JSONB        NOT NULL,
    description  JSONB,
    is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
    sort_order   INTEGER      NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by   VARCHAR(9)   NOT NULL REFERENCES member.register(member_id),
    updated_by   VARCHAR(9)   NOT NULL REFERENCES member.register(member_id)
);

CREATE TABLE inventory.items (
    item_id              VARCHAR(9)                NOT NULL PRIMARY KEY,
    category_id          VARCHAR(9)                NOT NULL REFERENCES inventory.categories(category_id),
    location_id          VARCHAR(9)                REFERENCES inventory.locations(location_id),
    item_type            inventory.item_type       NOT NULL DEFAULT 'CONSUMABLE',
    name                 JSONB                     NOT NULL,
    description          JSONB,
    quantity             INTEGER                   NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    low_stock_threshold  INTEGER,
    condition            inventory.item_condition  NOT NULL DEFAULT 'UNKNOWN',
    serial_number        TEXT,
    image_url            TEXT,
    notes                TEXT,
    tags                 TEXT[]                    NOT NULL DEFAULT '{}',
    is_active            BOOLEAN                   NOT NULL DEFAULT TRUE,
    created_at           TIMESTAMPTZ               NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ               NOT NULL DEFAULT NOW(),
    created_by           VARCHAR(9)                NOT NULL REFERENCES member.register(member_id),
    updated_by           VARCHAR(9)                NOT NULL REFERENCES member.register(member_id)
);

CREATE TABLE inventory.audit_log (
    log_id        SERIAL        PRIMARY KEY,
    item_id       VARCHAR(9)    NOT NULL REFERENCES inventory.items(item_id) ON DELETE CASCADE,
    member_id     VARCHAR(9)    NOT NULL REFERENCES member.register(member_id),
    change_type   TEXT          NOT NULL,
    old_value     JSONB,
    new_value     JSONB,
    notes         TEXT,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
