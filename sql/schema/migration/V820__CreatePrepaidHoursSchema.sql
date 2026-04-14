-- ============================================================
-- V820 – Create prepaid_hours schema for flight hours packages
-- ============================================================

-- ----------------------------------------------------------------
-- Flight hours package definitions (links to a shop product)
-- ----------------------------------------------------------------
CREATE TABLE prepaid.packages (    
    product_id                VARCHAR(9)    NOT NULL,
    aircraft_registration     VARCHAR(9)    NOT NULL,
    
    -- Package size stored in minutes
    minutes_per_package       INTEGER       NOT NULL CHECK (minutes_per_package > 0),

    -- Per minute rate for this package (may differ from standard aircraft pricing)
    per_min_rate              NUMERIC(10,2) NOT NULL CHECK (per_min_rate >= 0),

    -- Total packages available for sale
    total_packages_available  INTEGER       NOT NULL CHECK (total_packages_available > 0),

    -- Maximum packages a single member may purchase (NULL = unlimited)
    max_per_member            INTEGER       CHECK (max_per_member > 0),

    -- Number of packages sold so far
    sold_count                INTEGER       NOT NULL DEFAULT 0 CHECK (sold_count >= 0),

    -- SimplBooks item code used for the negative-value deduction line on invoices
    simplbooks_item_id VARCHAR(100),
    total_price NUMERIC(10,2)
        GENERATED ALWAYS AS (per_min_rate * minutes_per_package) STORED,

    -- Packages expire on this date (copies to member_packages at purchase time)
    expires_at                DATE          NOT NULL,

    is_active                 BOOLEAN       NOT NULL DEFAULT TRUE,

    created_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    created_by                VARCHAR(9)    NOT NULL,
    updated_by                VARCHAR(9)    NOT NULL,

    -- Constraints
    CONSTRAINT pk_prepaid_packages PRIMARY KEY (product_id),

    CONSTRAINT fk_prepaid_product
        FOREIGN KEY (product_id)
        REFERENCES shop.products(product_id),

    CONSTRAINT fk_prepaid_aircraft
        FOREIGN KEY (aircraft_registration)
        REFERENCES flight.aircraft(registration),

    CONSTRAINT fk_prepaid_created_by
        FOREIGN KEY (created_by)
        REFERENCES member.register(member_id),

    CONSTRAINT fk_prepaid_updated_by
        FOREIGN KEY (updated_by)
        REFERENCES member.register(member_id),

    -- Prevent overselling
    CONSTRAINT chk_sold_not_exceed_total
        CHECK (sold_count <= total_packages_available)
);


-- ----------------------------------------------------------------
-- Member-owned package instances (created when an order is confirmed)
-- ----------------------------------------------------------------
CREATE TABLE prepaid.member_packages (
    member_package_id  SERIAL        PRIMARY KEY,
    member_id          VARCHAR(9)    NOT NULL REFERENCES member.register(member_id),
    product_id         VARCHAR(9)    NOT NULL REFERENCES prepaid.packages(product_id),
    order_id           VARCHAR(9)    REFERENCES shop.orders(order_id),
    -- Total minutes included in this package at the time of purchase
    total_minutes      INTEGER       NOT NULL CHECK (total_minutes > 0),
    -- Minutes consumed so far
    used_minutes       INTEGER       NOT NULL DEFAULT 0 CHECK (used_minutes >= 0),
    remaining_minutes INTEGER
        GENERATED ALWAYS AS (total_minutes - used_minutes) STORED,
    -- Expiry date copied from the package at purchase time
    expires_at         DATE          NOT NULL,
    -- Soft-expire flag; also set automatically when remaining = 0
    is_expired         BOOLEAN       NOT NULL DEFAULT FALSE,
    created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_used_lte_total CHECK (used_minutes <= total_minutes)
);

-- ----------------------------------------------------------------
-- Usage log: records every deduction made against a member package
-- ----------------------------------------------------------------
CREATE TABLE prepaid.usage_log (
    usage_id           SERIAL       PRIMARY KEY,
    member_package_id  INTEGER      NOT NULL REFERENCES prepaid.member_packages(member_package_id),
    flight_id          VARCHAR(9)   REFERENCES flight.logs(flight_id),
    minutes_used       INTEGER      NOT NULL CHECK (minutes_used > 0),
    applied_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    note               TEXT
);

-- ----------------------------------------------------------------
-- Indexes
-- ----------------------------------------------------------------
CREATE INDEX idx_prepaid_member_packages_member ON prepaid.member_packages(member_id);
CREATE INDEX idx_prepaid_member_packages_aircraft ON prepaid.member_packages(product_id);
CREATE INDEX idx_prepaid_usage_log_package ON prepaid.usage_log(member_package_id);
CREATE INDEX idx_prepaid_usage_log_flight ON prepaid.usage_log(flight_id);
