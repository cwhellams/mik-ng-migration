-- ============================================================
-- V800 – Create shop schema
-- ============================================================



-- ----------------------------------------------------------------
-- Product categories (configurable by admin)
-- ----------------------------------------------------------------
CREATE TABLE shop.categories (
    category_id  VARCHAR(9)   NOT NULL CONSTRAINT pk_shop_categories PRIMARY KEY,
    name         JSONB        NOT NULL,   -- {en, fi, sv}
    description  JSONB,
    is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
    sort_order   INTEGER      NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by   VARCHAR(9)   NOT NULL REFERENCES member.register(member_id),
    updated_by   VARCHAR(9)   NOT NULL REFERENCES member.register(member_id)
);

-- ----------------------------------------------------------------
-- Products
-- ----------------------------------------------------------------
CREATE TYPE shop.product_type AS ENUM (
    'STANDARD',
    'FLIGHT_HOURS_PACKAGE'
);

CREATE TABLE shop.products (
    product_id          VARCHAR(9)          NOT NULL CONSTRAINT pk_shop_products PRIMARY KEY,
    category_id         VARCHAR(9)          NOT NULL REFERENCES shop.categories(category_id),
    simplbooks_item_id  VARCHAR(100),       -- SimplBooks item code or other external ID
    product_type        shop.product_type   NOT NULL DEFAULT 'STANDARD',
    name                JSONB               NOT NULL,   -- {en, fi, sv}
    description         JSONB,
    price               NUMERIC(10,2)       NOT NULL CHECK (price >= 0),
    vat_percent         NUMERIC(5,2)        NOT NULL DEFAULT 24,
    stock_quantity      INTEGER             NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    low_stock_threshold INTEGER,
    max_order_quantity  INTEGER,            -- max per order (NULL = unlimited)
    is_active           BOOLEAN             NOT NULL DEFAULT TRUE,
    is_published        BOOLEAN             NOT NULL DEFAULT FALSE,
    tags                TEXT[]              NOT NULL DEFAULT '{}',
    metadata            JSONB,
    image_url           TEXT,
    created_at          TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    created_by          VARCHAR(9)          NOT NULL REFERENCES member.register(member_id),
    updated_by          VARCHAR(9)          NOT NULL REFERENCES member.register(member_id)
);

-- ----------------------------------------------------------------
-- Product properties (e.g. "Size", "Colour")
-- ----------------------------------------------------------------
CREATE TABLE shop.product_properties (
    property_id  SERIAL       PRIMARY KEY,
    product_id   VARCHAR(9)   NOT NULL REFERENCES shop.products(product_id) ON DELETE CASCADE,
    name         JSONB        NOT NULL,   -- {en, fi, sv}
    is_required  BOOLEAN      NOT NULL DEFAULT TRUE,
    sort_order   INTEGER      NOT NULL DEFAULT 0
);

-- ----------------------------------------------------------------
-- Product property options (e.g. "S", "M", "L", "XL")
-- ----------------------------------------------------------------
CREATE TABLE shop.product_property_options (
    option_id    SERIAL     PRIMARY KEY,
    property_id  INTEGER    NOT NULL REFERENCES shop.product_properties(property_id) ON DELETE CASCADE,
    value        JSONB      NOT NULL,   -- {en, fi, sv}
    stock_quantity INTEGER,    
    sort_order   INTEGER    NOT NULL DEFAULT 0,    
    is_active    BOOLEAN    NOT NULL DEFAULT TRUE,
    CONSTRAINT chk_shop_product_property_options_stock_quantity
    CHECK (stock_quantity IS NULL OR stock_quantity >= 0)
);

-- ----------------------------------------------------------------
-- Discount codes
-- ----------------------------------------------------------------
CREATE TABLE shop.discount_codes (
    code_id           SERIAL          PRIMARY KEY,
    code              VARCHAR(50)     NOT NULL UNIQUE,
    description       TEXT,
    discount_type     VARCHAR(20)     NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
    discount_value    NUMERIC(10,2)   NOT NULL CHECK (discount_value > 0),
    min_order_amount  NUMERIC(10,2),
    max_uses          INTEGER,
    uses_count        INTEGER         NOT NULL DEFAULT 0,
    valid_from        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    valid_until       TIMESTAMPTZ,
    is_active         BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    created_by        VARCHAR(9)      NOT NULL REFERENCES member.register(member_id),
    updated_by        VARCHAR(9)      NOT NULL REFERENCES member.register(member_id)
);

-- ----------------------------------------------------------------
-- Shopping carts (one per member, persisted across sessions)
-- ----------------------------------------------------------------
CREATE TABLE shop.carts (
    cart_id          VARCHAR(9)  NOT NULL CONSTRAINT pk_shop_carts PRIMARY KEY,
    member_id        VARCHAR(9)  NOT NULL UNIQUE REFERENCES member.register(member_id),
    discount_code_id INTEGER     REFERENCES shop.discount_codes(code_id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- Cart items
-- ----------------------------------------------------------------
CREATE TABLE shop.cart_items (
    cart_item_id      SERIAL      PRIMARY KEY,
    cart_id           VARCHAR(9)  NOT NULL REFERENCES shop.carts(cart_id) ON DELETE CASCADE,
    product_id        VARCHAR(9)  NOT NULL REFERENCES shop.products(product_id),
    quantity          INTEGER     NOT NULL DEFAULT 1 CHECK (quantity > 0),
    selected_options  JSONB,      -- {property_id: option_id}
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- Orders
-- ----------------------------------------------------------------
CREATE TYPE shop.order_status AS ENUM (
    'PENDING',
    'PROCESSING',
    'INVOICED',
    'CANCELLED',
    'REFUNDED'
);

CREATE TABLE shop.orders (
    order_id         VARCHAR(9)         NOT NULL CONSTRAINT pk_shop_orders PRIMARY KEY,
    member_id        VARCHAR(9)         NOT NULL REFERENCES member.register(member_id),
    status           shop.order_status  NOT NULL DEFAULT 'PENDING',
    total_amount     NUMERIC(10,2)      NOT NULL,
    discount_code_id INTEGER            REFERENCES shop.discount_codes(code_id),
    discount_amount  NUMERIC(10,2),
    invoice_id       INT8,              -- FK to accts.invoice.id once created
    notes            TEXT,
    created_at       TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
    created_by       VARCHAR(9)         NOT NULL REFERENCES member.register(member_id),
    updated_by       VARCHAR(9)         NOT NULL REFERENCES member.register(member_id)
);

-- ----------------------------------------------------------------
-- Order items
-- ----------------------------------------------------------------
CREATE TABLE shop.order_items (
    order_item_id     SERIAL          PRIMARY KEY,
    order_id          VARCHAR(9)      NOT NULL REFERENCES shop.orders(order_id) ON DELETE CASCADE,
    product_id        VARCHAR(9)      NOT NULL REFERENCES shop.products(product_id),
    quantity          INTEGER         NOT NULL CHECK (quantity > 0),
    unit_price        NUMERIC(10,2)   NOT NULL,
    total_price       NUMERIC(10,2)   NOT NULL,
    selected_options  JSONB,          -- {property_id: option_id}
    product_snapshot  JSONB           NOT NULL  -- product name/price at time of purchase
);
