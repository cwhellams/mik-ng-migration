-- ============================================================
-- V2010__CreateInventoryItemUnitsTable
--
-- Per-unit identity for inventory items (#1139).
--
-- An `inventory.items` row is a *group* — "Life Vest", quantity 8. A physical
-- unit of that group is a row here, so a reservation can name one ("the vest
-- with tag A12") and capacity can be counted ("how many vests exist at all").
-- `inventory.items.serial_number` is left alone: single-unit items that only
-- ever carry one serial are not exploded into unit rows by this migration.
-- ============================================================

CREATE TYPE inventory.item_unit_status AS ENUM
  ('AVAILABLE', 'RESERVED', 'ON_LOAN', 'MAINTENANCE', 'LOST', 'RETIRED');

CREATE TABLE inventory.item_units (
    unit_id     VARCHAR(9)                  NOT NULL PRIMARY KEY,
    item_id     VARCHAR(9)                  NOT NULL REFERENCES inventory.items(item_id),
    -- Optional serial / asset tag. Unique per item, so two vests can both be
    -- untagged (NULLs don't collide in a UNIQUE constraint) but no two can
    -- claim the same tag.
    tag         TEXT,
    status      inventory.item_unit_status  NOT NULL DEFAULT 'AVAILABLE',
    condition   inventory.item_condition    NOT NULL DEFAULT 'UNKNOWN',
    notes       TEXT,
    -- Soft-retire, so historical reservations keep pointing at a real row.
    is_active   BOOLEAN                     NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ                 NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ                 NOT NULL DEFAULT NOW(),
    created_by  VARCHAR(9)                  NOT NULL REFERENCES member.register(member_id),
    updated_by  VARCHAR(9)                  NOT NULL REFERENCES member.register(member_id),
    CONSTRAINT uq_item_units_tag UNIQUE (item_id, tag)
);

CREATE INDEX idx_item_units_item_id ON inventory.item_units(item_id);

-- Pure consumables (printer paper, cleaning cloths) are tracked by quantity
-- alone and would only clutter the reservation calendar's item picker.
ALTER TABLE inventory.items
    ADD COLUMN is_reservable BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN inventory.items.is_reservable IS
  'Whether this item appears in the item reservation calendar. Defaults to false so existing consumables stay out of it.';

-- ── Permissions ─────────────────────────────────────────────────────────────
-- Reserving an item is a different privilege axis from managing the inventory
-- catalog, the same way BOOKING_USER is distinct from AIRCRAFT_USER.

UPDATE member.roles
SET permissions = COALESCE(permissions, '[]'::jsonb) || '["inventory_reservation.admin"]'::jsonb,
    updated_at  = NOW(),
    updated_by  = 'k1mnimda'
WHERE role_id = 'ADMIN'
  AND (permissions IS NULL OR NOT (permissions @> '["inventory_reservation.admin"]'::jsonb));

UPDATE member.roles
SET permissions = COALESCE(permissions, '[]'::jsonb) || '["inventory_reservation.user"]'::jsonb,
    updated_at  = NOW(),
    updated_by  = 'k1mnimda'
WHERE role_id IN ('MEMBER', 'FLYING_MEMBER')
  AND (permissions IS NULL OR NOT (permissions @> '["inventory_reservation.user"]'::jsonb));
