-- ============================================================
-- V2060__CreateLiquidSchema  --  Liquid Management System (#1119)
-- ============================================================
-- One unified record for every litre of fuel or oil that goes into a club
-- aircraft, independent of the flight log: a member may fuel an aircraft even
-- when the planned flight is cancelled, so the record cannot live on
-- flight.logs.  flight.logs.fuel_uplift_litres / oil_uplift_litres stay exactly
-- as they are -- there is no backfill, the new system starts from a clean state
-- and the legacy columns remain read-only history.
--
-- The `liquid` schema itself is created by Flyway from `flyway.schemas` in
-- sql/migration.conf and sql/migration_prod.conf (never with CREATE SCHEMA), so
-- the GRANT USAGE below is mandatory: a fresh schema grants nothing to PUBLIC,
-- and local dev connects as the `admin` superuser, which would hide the failure
-- until the restricted prod/test role hit `permission denied for schema liquid`.

GRANT USAGE ON SCHEMA liquid TO ${app_db_user};


-- ─── Fuel providers ──────────────────────────────────────────────────────────
-- Who sold the fuel.  At EFNU the member never picks one: the provider follows
-- from the fuel type (issue #1119, "Home-base flow"), and it is stored anyway
-- because the club needs it for technical/reporting purposes.  Away from EFNU
-- the member picks AirBP, Kanair, or pays themselves.
CREATE TABLE liquid.fuel_provider (
    provider_id         SERIAL       PRIMARY KEY,
    code                TEXT         NOT NULL UNIQUE,
    name                TEXT         NOT NULL,
    -- Set for the three home-base providers, NULL for the ones that can appear
    -- at any airport.
    default_airport     VARCHAR(10)  NULL REFERENCES static.airfields (ident),
    -- Which fuel types this provider sells.  NULL means "no restriction" --
    -- AirBP/Kanair/own payment sell whatever the airport has.
    fuel_types          TEXT[]       NULL,
    -- EFNU fuelling is invoiced to the club directly, so the member has no
    -- total cost to report; everywhere else the total is required.
    requires_total_cost BOOLEAN      NOT NULL DEFAULT TRUE,
    -- Whether a purchase through this provider is the member's own money and
    -- therefore claimable: AirBP/Kanair are club fuel cards -- the member swipes
    -- one and the club is billed directly, so recording a total cost there is
    -- for reconciliation, not reimbursement. Only "Other / own payment" (and,
    -- moot since it never has a total cost, the home-base providers) is money
    -- out of the member's own pocket. This is what the claimable-fuel dashboard
    -- prompt filters on, instead of "has a total cost", which Kanair/AirBP also
    -- have.
    requires_claim      BOOLEAN      NOT NULL DEFAULT FALSE,
    is_home_base        BOOLEAN      NOT NULL DEFAULT FALSE,
    sort_order          INTEGER      NOT NULL DEFAULT 0,
    is_active           BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by          VARCHAR(9)   NOT NULL,
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_by          VARCHAR(9)   NOT NULL
);

COMMENT ON TABLE liquid.fuel_provider IS
    'Fuel sellers. The three EFNU providers are picked by fuel type rather than by the member.';

-- default_airport is deliberately left NULL here and filled in by the data phase
-- (sql/schema/static_data/V30 in production, sql/schema/testdata/V350 in tests).
-- static.airfields is itself seeded by that phase -- static_data/V10 for
-- production, testdata/V20 for tests -- which runs *after* every schema
-- migration, so a schema migration cannot reference an airfield row without
-- failing the foreign key below. `is_home_base` is what the application actually
-- branches on; default_airport is reference data for the UI.
INSERT INTO liquid.fuel_provider
    (code, name, fuel_types, requires_total_cost, requires_claim, is_home_base, sort_order, created_by, updated_by)
VALUES
    ('MPL',       'Moottoripurjelentäjät',                ARRAY['MOGAS 98E5', 'MOGAS 95E10'], FALSE, FALSE, TRUE,  10, 'system', 'system'),
    ('EFNU_FUEL', 'EFNU Polttoainemyynti',                ARRAY['100LL'],                     FALSE, FALSE, TRUE,  20, 'system', 'system'),
    ('LOKKI',     'Lentokoneosakeyhtiö Lokki & Kumppanit', ARRAY['JET A-1'],                   FALSE, FALSE, TRUE,  30, 'system', 'system'),
    ('AIRBP',     'AirBP',                                NULL,                               TRUE,  FALSE, FALSE, 40, 'system', 'system'),
    ('KANAIR',    'Kanair',                               NULL,                               TRUE,  FALSE, FALSE, 50, 'system', 'system'),
    ('OTHER',     'Other / own payment',                  NULL,                               TRUE,  TRUE,  FALSE, 60, 'system', 'system');


-- ─── Oil canister inventory ──────────────────────────────────────────────────
-- A physical canister on the club's shelf.  Its aircraft is assigned once, at
-- inventory creation, and is permanent -- enforced by a trigger below rather
-- than only in the service layer, because "assigned permanently" is a property
-- of the data, not of one code path.
CREATE TABLE liquid.oil_canister (
    canister_id           UUID          NOT NULL DEFAULT gen_random_uuid(),
    -- Club-assigned identifier.  Free text, because the admin has the canister
    -- in hand and the club's own label wins; the UI pre-fills the club's
    -- "MIK <make> <YY>/<seq>" format so it is the path of least resistance.
    club_canister_ref     TEXT          NOT NULL,
    batch_number          TEXT          NOT NULL,
    manufacturing_date    DATE          NULL,
    make                  TEXT          NOT NULL,
    model_viscosity       TEXT          NOT NULL,
    aircraft_registration VARCHAR(10)   NOT NULL REFERENCES flight.aircraft (registration),
    initial_litres        NUMERIC(6, 3) NULL CHECK (initial_litres IS NULL OR initial_litres > 0),
    -- Informational only.  The issue is explicit that remaining quantity is
    -- never enforced against reported usage, so nothing derives or validates
    -- this from liquid.record.
    remaining_litres      NUMERIC(6, 3) NULL CHECK (remaining_litres IS NULL OR remaining_litres >= 0),
    is_opened             BOOLEAN       NOT NULL DEFAULT FALSE,
    opened_at             TIMESTAMPTZ   NULL,
    is_empty              BOOLEAN       NOT NULL DEFAULT FALSE,
    emptied_at            TIMESTAMPTZ   NULL,
    created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
    created_by            VARCHAR(9)    NOT NULL,
    updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_by            VARCHAR(9)    NOT NULL,

    CONSTRAINT oil_canister_pkey    PRIMARY KEY (canister_id),
    CONSTRAINT oil_canister_ref_key UNIQUE (club_canister_ref)
);

CREATE INDEX oil_canister_available_idx
    ON liquid.oil_canister (aircraft_registration, club_canister_ref)
    WHERE is_empty = FALSE;

COMMENT ON COLUMN liquid.oil_canister.remaining_litres IS
    'Informational. Deliberately not validated against reported usage (#1119).';

-- "Aircraft, assigned permanently at inventory creation."  A trigger, not just
-- an API check: an oil record already filed against the canister names the
-- aircraft the oil went into, so moving the canister would silently rewrite
-- history.
CREATE OR REPLACE FUNCTION liquid.oil_canister_aircraft_is_permanent()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.aircraft_registration IS DISTINCT FROM OLD.aircraft_registration THEN
    RAISE EXCEPTION
      'liquid.oil_canister.aircraft_registration is permanent (canister %, % -> %)',
      OLD.canister_id, OLD.aircraft_registration, NEW.aircraft_registration
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER oil_canister_aircraft_is_permanent_trigger
BEFORE UPDATE ON liquid.oil_canister
FOR EACH ROW EXECUTE FUNCTION liquid.oil_canister_aircraft_is_permanent();


-- ─── Fuel stations (deep-link targets) ───────────────────────────────────────
-- What a pump-mounted QR code points at: enough context that the member only
-- has to enter litres.  Kept apart from liquid.fuel_provider because one
-- provider can have several pumps and one pump serves exactly one fuel type.
CREATE TABLE liquid.fuel_station (
    station_id            UUID        NOT NULL DEFAULT gen_random_uuid(),
    label                 TEXT        NOT NULL,
    airport               VARCHAR(10) NOT NULL REFERENCES static.airfields (ident),
    fuel_type             TEXT        NULL REFERENCES flight.fuel_types (name),
    provider_id           INTEGER     NULL REFERENCES liquid.fuel_provider (provider_id),
    -- Set only for a pump dedicated to one aircraft; normally NULL, and the
    -- member picks the aircraft.
    aircraft_registration VARCHAR(10) NULL REFERENCES flight.aircraft (registration),
    is_active             BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by            VARCHAR(9)  NOT NULL,
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by            VARCHAR(9)  NOT NULL,

    CONSTRAINT fuel_station_pkey PRIMARY KEY (station_id)
);

-- The EFNU pumps are seeded by the data phase alongside the airfields they
-- reference; see the note on liquid.fuel_provider above.


-- ─── QR identities ───────────────────────────────────────────────────────────
-- A QR code is generated as an *identity* first and assigned to a target later,
-- so a sheet can be printed and stuck on things over the following weeks.  The
-- image encodes only /liquid/scan/<code> -- never the deep link -- which is why
-- the identity survives independently of what it ends up pointing at.
CREATE TABLE liquid.qr_batch (
    batch_id   UUID        NOT NULL DEFAULT gen_random_uuid(),
    label      TEXT        NOT NULL,
    code_count INTEGER     NOT NULL CHECK (code_count > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by VARCHAR(9)  NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by VARCHAR(9)  NOT NULL,

    CONSTRAINT qr_batch_pkey PRIMARY KEY (batch_id)
);

CREATE TABLE liquid.qr_code (
    qr_id       UUID        NOT NULL DEFAULT gen_random_uuid(),
    -- Human-readable identifier printed under the QR image, e.g. MIK-L-7F3K.
    code        TEXT        NOT NULL,
    batch_id    UUID        NULL REFERENCES liquid.qr_batch (batch_id),
    -- NULL until assigned.  Kept as TEXT rather than an enum so the "rent/loan"
    -- shop feature can add its own target type in one migration; the CHECK is
    -- the list of types that exist today.
    target_type TEXT        NULL,
    target_id   TEXT        NULL,
    assigned_at TIMESTAMPTZ NULL,
    assigned_by VARCHAR(9)  NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by  VARCHAR(9)  NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by  VARCHAR(9)  NOT NULL,

    CONSTRAINT qr_code_pkey        PRIMARY KEY (qr_id),
    CONSTRAINT qr_code_code_key    UNIQUE (code),
    CONSTRAINT qr_code_target_type_chk
        CHECK (target_type IS NULL OR target_type IN ('OIL_CANISTER', 'FUEL_STATION')),
    -- An assigned code has both halves or neither; a half-assigned code would
    -- resolve to nothing and still be permanently burnt.
    CONSTRAINT qr_code_target_pair_chk
        CHECK ((target_type IS NULL) = (target_id IS NULL))
);

CREATE INDEX qr_code_unassigned_idx ON liquid.qr_code (created_at) WHERE target_type IS NULL;
CREATE INDEX qr_code_target_idx     ON liquid.qr_code (target_type, target_id);

-- "QR codes are permanently bound after assignment."  In the database, because
-- the printed sticker is physically on the object -- a reassignment would send
-- every future scan of that sticker to the wrong canister.
CREATE OR REPLACE FUNCTION liquid.qr_code_binding_is_permanent()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.target_type IS NOT NULL
     AND (NEW.target_type IS DISTINCT FROM OLD.target_type
          OR NEW.target_id IS DISTINCT FROM OLD.target_id) THEN
    RAISE EXCEPTION
      'liquid.qr_code % is already assigned to %/% and cannot be reassigned',
      OLD.code, OLD.target_type, OLD.target_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER qr_code_binding_is_permanent_trigger
BEFORE UPDATE ON liquid.qr_code
FOR EACH ROW EXECUTE FUNCTION liquid.qr_code_binding_is_permanent();


-- ─── The liquid record ───────────────────────────────────────────────────────
CREATE TABLE liquid.record (
    record_id             UUID          NOT NULL DEFAULT gen_random_uuid(),
    liquid_type           TEXT          NOT NULL,
    aircraft_registration VARCHAR(10)   NOT NULL REFERENCES flight.aircraft (registration),
    -- The member the record belongs to: the one who may edit it inside the
    -- one-week window, and the one who may claim it as an expense.
    member_id             VARCHAR(9)    NOT NULL REFERENCES member.register (member_id),
    -- Defaults to scan/submission time; the member may edit it.
    recorded_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),

    -- Fuel
    airport               VARCHAR(10)   NULL REFERENCES static.airfields (ident),
    fuel_type             TEXT          NULL REFERENCES flight.fuel_types (name),
    provider_id           INTEGER       NULL REFERENCES liquid.fuel_provider (provider_id),
    quantity_litres       NUMERIC(10, 3) NOT NULL CHECK (quantity_litres > 0),
    total_cost            NUMERIC(12, 4) NULL CHECK (total_cost IS NULL OR total_cost >= 0),
    ccy                   VARCHAR(3)    NOT NULL DEFAULT 'EUR',
    -- Rate to EUR for a non-EUR purchase, mirroring accts.expense_claim.fx_rate.
    fx_rate               NUMERIC(18, 6) NULL CHECK (fx_rate IS NULL OR fx_rate > 0),
    -- Set automatically when the ICAO code does not start with EF and the fuel
    -- is Jet A-1; the member can override it.  Suppresses the Finnish fuel tax
    -- adjustment, because that price already includes tax.
    tax_included_abroad   BOOLEAN       NOT NULL DEFAULT FALSE,

    -- Oil
    oil_source            TEXT          NULL,
    oil_canister_id       UUID          NULL REFERENCES liquid.oil_canister (canister_id),
    -- Only for oil that did not come out of club inventory: the club still
    -- needs to know what went into the engine.
    oil_make              TEXT          NULL,
    oil_model_viscosity   TEXT          NULL,
    oil_batch_number      TEXT          NULL,
    remaining_litres      NUMERIC(6, 3) NULL CHECK (remaining_litres IS NULL OR remaining_litres >= 0),
    mark_canister_empty   BOOLEAN       NOT NULL DEFAULT FALSE,

    -- Links.  At most one of each, which the single nullable column already
    -- guarantees; neither is unique, because one flight can carry both a fuel
    -- and an oil record and one claim can bundle several fuellings (#1107).
    flight_log_id         VARCHAR(9)    NULL REFERENCES flight.logs (flight_id),
    expense_claim_id      UUID          NULL REFERENCES accts.expense_claim (id),
    qr_id                 UUID          NULL REFERENCES liquid.qr_code (qr_id),
    source                TEXT          NOT NULL DEFAULT 'MANUAL',

    -- Price audit trail, frozen when the record is linked to an expense claim.
    -- Copied onto the row rather than looked up later, so a future change to
    -- accts.fuel_tax cannot retroactively move a historical claim's figures.
    original_paid_total          NUMERIC(12, 4) NULL,
    original_price_per_litre     NUMERIC(12, 4) NULL,
    tax_adjusted_price_per_litre NUMERIC(12, 4) NULL,
    fuel_tax_year                INTEGER        NULL,
    fuel_tax_rate_applied        NUMERIC(10, 4) NULL,
    claim_linked_at              TIMESTAMPTZ    NULL,

    -- Soft delete.  "All changes and deletions, by any user, must be audit
    -- logged" is only reliably satisfiable this way: a hard DELETE would leave
    -- an audit row but break the FK trail from the claim or flight log that
    -- referenced it.
    deleted_at            TIMESTAMPTZ   NULL,
    deleted_by            VARCHAR(9)    NULL,

    created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
    created_by            VARCHAR(9)    NOT NULL,
    updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_by            VARCHAR(9)    NOT NULL,

    CONSTRAINT record_pkey PRIMARY KEY (record_id),

    CONSTRAINT record_liquid_type_chk CHECK (liquid_type IN ('FUEL', 'OIL')),
    CONSTRAINT record_source_chk      CHECK (source IN ('MANUAL', 'FLIGHT_LOG', 'QR')),

    -- Fuel needs where, what and from whom; oil carries none of the three.
    CONSTRAINT record_fuel_shape_chk CHECK (
        liquid_type <> 'FUEL'
        OR (airport IS NOT NULL AND fuel_type IS NOT NULL AND provider_id IS NOT NULL)
    ),
    -- "Away-from-EFNU flow: require total cost."  EFNU fuelling is invoiced to
    -- the club, so there the member has no total to give.
    CONSTRAINT record_fuel_away_cost_chk CHECK (
        liquid_type <> 'FUEL' OR airport = 'EFNU' OR total_cost IS NOT NULL
    ),
    CONSTRAINT record_oil_shape_chk CHECK (
        liquid_type <> 'OIL' OR oil_source IN ('CANISTER', 'OTHER')
    ),
    -- Club-inventory oil names a canister; other oil names what it was instead.
    CONSTRAINT record_oil_canister_chk CHECK (
        liquid_type <> 'OIL'
        OR (oil_source = 'CANISTER') = (oil_canister_id IS NOT NULL)
    ),
    CONSTRAINT record_oil_other_details_chk CHECK (
        liquid_type <> 'OIL' OR oil_source <> 'OTHER'
        OR (oil_make IS NOT NULL AND oil_model_viscosity IS NOT NULL AND oil_batch_number IS NOT NULL)
    ),
    -- A non-EUR purchase without a rate cannot be converted, and the report and
    -- the claim both need EUR.
    CONSTRAINT record_fx_rate_chk CHECK (ccy = 'EUR' OR fx_rate IS NOT NULL),
    CONSTRAINT record_deleted_pair_chk CHECK ((deleted_at IS NULL) = (deleted_by IS NULL))
);

-- Backs "suggest the aircraft's most recent eligible liquid records" when
-- linking one to a flight log.
CREATE INDEX record_unlinked_suggestion_idx
    ON liquid.record (aircraft_registration, liquid_type, recorded_at DESC)
    WHERE flight_log_id IS NULL AND deleted_at IS NULL;

CREATE INDEX record_member_idx ON liquid.record (member_id, recorded_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX record_claim_idx  ON liquid.record (expense_claim_id)
    WHERE expense_claim_id IS NOT NULL;

CREATE INDEX record_flight_idx ON liquid.record (flight_log_id)
    WHERE flight_log_id IS NOT NULL;

-- The fuel-price comparison report's date-range scan.
CREATE INDEX record_fuel_report_idx ON liquid.record (recorded_at)
    WHERE liquid_type = 'FUEL' AND deleted_at IS NULL;

COMMENT ON TABLE liquid.record IS
    'One fuel or oil uplift, independent of any flight log (#1119).';


-- ─── Audit ───────────────────────────────────────────────────────────────────
-- Trigger-based, following flight.defect_audit (V1223): a code path that
-- forgets to log cannot exist.  Soft deletes arrive here as UPDATEs whose
-- deleted_by names the actor; a genuine DELETE is audited too, as a safety net.
CREATE TABLE liquid.record_audit (
    audit_id       SERIAL      PRIMARY KEY,
    record_id      UUID        NOT NULL,
    operation_type TEXT        NOT NULL,
    changed_data   JSONB,
    new_data       JSONB,
    changed_by     VARCHAR(9)  NOT NULL,
    changed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX record_audit_record_idx ON liquid.record_audit (record_id, changed_at DESC);

CREATE OR REPLACE FUNCTION liquid.record_audit_trigger_function()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO liquid.record_audit (record_id, operation_type, changed_data, changed_by)
    VALUES (OLD.record_id, 'DELETE', to_jsonb(OLD), COALESCE(OLD.deleted_by, OLD.updated_by));

  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO liquid.record_audit (record_id, operation_type, changed_data, new_data, changed_by)
    VALUES (
      NEW.record_id,
      CASE WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN 'SOFT_DELETE' ELSE 'UPDATE' END,
      to_jsonb(OLD),
      to_jsonb(NEW),
      COALESCE(NEW.deleted_by, NEW.updated_by)
    );

  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO liquid.record_audit (record_id, operation_type, new_data, changed_by)
    VALUES (NEW.record_id, 'INSERT', to_jsonb(NEW), NEW.created_by);
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER record_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON liquid.record
FOR EACH ROW EXECUTE FUNCTION liquid.record_audit_trigger_function();


-- ─── Grants ──────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA liquid TO ${app_db_user};
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA liquid TO ${app_db_user};

ALTER DEFAULT PRIVILEGES IN SCHEMA liquid
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${app_db_user};

ALTER DEFAULT PRIVILEGES IN SCHEMA liquid
    GRANT USAGE, SELECT ON SEQUENCES TO ${app_db_user};
