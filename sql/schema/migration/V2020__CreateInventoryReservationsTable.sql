-- ============================================================
-- V2020__CreateInventoryReservationsTable
--
-- The item reservation calendar (#1139). Modelled on schedule.bookings (V320)
-- rather than generalising it: aircraft-specific concepts (instructor, medical
-- currency, member-to-member transfer, cancellation-reason taxonomy) have no
-- meaning for an oxygen tank, and threading them through would make both
-- domains harder to read.
--
-- Two additions over a booking:
--   * `quantity` — "3 life vests for this flight" is one reservation, not three.
--   * `linked_booking_id` — an item reservation usually rides along with a
--     flight booking. The booking is the source of truth; the cascade is
--     one-way (see the reservation routes) so cancelling the vests never
--     cancels the aeroplane.
-- ============================================================

CREATE TYPE inventory.reservation_status AS ENUM ('CONFIRMED', 'CANCELLED');

CREATE TABLE inventory.reservations (
    reservation_id     VARCHAR(9)                        NOT NULL PRIMARY KEY,
    member_id          VARCHAR(9)                        NOT NULL REFERENCES member.register(member_id),
    item_id            VARCHAR(9)                        NOT NULL REFERENCES inventory.items(item_id),
    -- NULL means "any unit from the pool"; a value pins one physical unit.
    unit_id            VARCHAR(9)                        REFERENCES inventory.item_units(unit_id),
    quantity           INTEGER                           NOT NULL DEFAULT 1 CHECK (quantity > 0),
    -- No ON DELETE CASCADE: bookings are never hard-deleted, cancelBooking()
    -- only flips booking_status.
    linked_booking_id  VARCHAR(9)                        REFERENCES schedule.bookings(booking_id),
    reservation_status inventory.reservation_status      NOT NULL,
    start_time_epoch   BIGINT                            NOT NULL,
    end_time_epoch     BIGINT                            NOT NULL,
    description        TEXT,
    created_at         TIMESTAMPTZ                       NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ                       NOT NULL DEFAULT NOW(),
    created_by         VARCHAR(9)                        NOT NULL REFERENCES member.register(member_id),
    updated_by         VARCHAR(9)                        NOT NULL REFERENCES member.register(member_id),
    cancelled_at       TIMESTAMPTZ,
    cancelled_by       VARCHAR(9)                        REFERENCES member.register(member_id),
    -- Free text rather than a closed enum: it has to carry member-cancelled,
    -- admin-cancelled and cascade-cancelled-from-a-booking reasons alike, and
    -- the same email renders all of them.
    cancellation_note  TEXT,
    CONSTRAINT check_reservation_time_sequence CHECK (start_time_epoch < end_time_epoch),
    -- A reservation that names one physical unit is by definition one unit.
    CONSTRAINT check_specific_unit_quantity CHECK (unit_id IS NULL OR quantity = 1),
    CONSTRAINT cancelled_audit_check CHECK (
        reservation_status = 'CANCELLED'
        AND cancelled_at IS NOT NULL
        AND cancelled_by IS NOT NULL
        OR reservation_status <> 'CANCELLED'
        AND cancelled_at IS NULL
        AND cancelled_by IS NULL
    ),
    -- Computed columns to convert BIGINT timestamps to TIMESTAMPTZ, as on bookings
    start_time_utc TIMESTAMPTZ NOT NULL GENERATED ALWAYS AS (TO_TIMESTAMP(start_time_epoch)) STORED,
    end_time_utc   TIMESTAMPTZ NOT NULL GENERATED ALWAYS AS (TO_TIMESTAMP(end_time_epoch)) STORED
);

CREATE INDEX idx_reservations_item_time
    ON inventory.reservations(item_id, start_time_epoch, end_time_epoch);
CREATE INDEX idx_reservations_member
    ON inventory.reservations(member_id);
CREATE INDEX idx_reservations_linked_booking
    ON inventory.reservations(linked_booking_id)
    WHERE linked_booking_id IS NOT NULL;
