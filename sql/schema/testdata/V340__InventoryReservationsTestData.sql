-- ============================================================
-- V340__InventoryReservationsTestData
--
-- Reservable inventory items, their physical units and a handful of
-- reservations, for the item reservation calendar (#1139).
--
-- Times are relative to current_date, like V120__bookings.sql, so a suite run
-- any day sees the same "yesterday / tomorrow" shape.
-- ============================================================

DELETE FROM inventory.reservations WHERE reservation_id LIKE 'resv%';
DELETE FROM inventory.item_units   WHERE unit_id LIKE 'VEST%' OR unit_id LIKE 'O2%';
DELETE FROM inventory.items        WHERE item_id IN ('INV_VEST', 'INV_O2', 'INV_PAPER');

INSERT INTO inventory.items (
    item_id, category_id, location_id, item_type, name, description,
    quantity, condition, is_reservable, is_active, created_by, updated_by
) VALUES
  (
    'INV_VEST', 'INV_OTHER', 'LOC_MALMI', 'ASSET',
    '{"en": "Life Vest", "fi": "Pelastusliivi", "sv": "Flytväst"}'::JSONB,
    '{"en": "Inflatable life vest for over-water flights", "fi": "Puhallettava pelastusliivi vesilennoille", "sv": "Uppblåsbar flytväst för flygning över vatten"}'::JSONB,
    5, 'GOOD', TRUE, TRUE, 'k1mnimda', 'k1mnimda'
  ),
  (
    'INV_O2', 'INV_OTHER', 'LOC_MALMI', 'ASSET',
    '{"en": "Oxygen Tank", "fi": "Happipullo", "sv": "Syrgastub"}'::JSONB,
    '{"en": "Portable oxygen tank for high altitude flights", "fi": "Kannettava happipullo korkeuslennoille", "sv": "Portabel syrgastub för höghöjdsflygning"}'::JSONB,
    2, 'GOOD', TRUE, TRUE, 'k1mnimda', 'k1mnimda'
  ),
  -- Deliberately not reservable: a consumable tracked by quantity alone, which
  -- must stay out of the reservation calendar's item picker.
  (
    'INV_PAPER', 'INV_OTHER', 'LOC_MALMI', 'CONSUMABLE',
    '{"en": "Printer Paper", "fi": "Tulostuspaperi", "sv": "Skrivarpapper"}'::JSONB,
    '{"en": "A4 paper for the clubhouse printer", "fi": "A4-paperia kerhotalon tulostimeen", "sv": "A4-papper till klubbhusets skrivare"}'::JSONB,
    40, 'UNKNOWN', FALSE, TRUE, 'k1mnimda', 'k1mnimda'
  );

INSERT INTO inventory.item_units (unit_id, item_id, tag, status, condition, notes, is_active, created_by, updated_by)
VALUES
  ('VEST1', 'INV_VEST', 'LV-001', 'AVAILABLE',   'GOOD',    NULL, TRUE,  'k1mnimda', 'k1mnimda'),
  ('VEST2', 'INV_VEST', 'LV-002', 'AVAILABLE',   'GOOD',    NULL, TRUE,  'k1mnimda', 'k1mnimda'),
  ('VEST3', 'INV_VEST', 'LV-003', 'AVAILABLE',   'FAIR',    NULL, TRUE,  'k1mnimda', 'k1mnimda'),
  ('VEST4', 'INV_VEST', 'LV-004', 'AVAILABLE',   'GOOD',    NULL, TRUE,  'k1mnimda', 'k1mnimda'),
  ('VEST5', 'INV_VEST', 'LV-005', 'MAINTENANCE', 'POOR',    'Whistle missing', TRUE,  'k1mnimda', 'k1mnimda'),
  -- Retired: still referenced by history, but out of the capacity pool.
  ('VEST6', 'INV_VEST', 'LV-006', 'RETIRED',     'POOR',    'Perished, withdrawn from service', FALSE, 'k1mnimda', 'k1mnimda'),
  ('O2A',   'INV_O2',   'OX-A',   'AVAILABLE',   'GOOD',    NULL, TRUE,  'k1mnimda', 'k1mnimda'),
  ('O2B',   'INV_O2',   'OX-B',   'AVAILABLE',   'UNKNOWN', NULL, TRUE,  'k1mnimda', 'k1mnimda');

-- resv1 rides along with flight booking stl1 and shares its window, which is
-- what the linked-booking column exists for.
INSERT INTO inventory.reservations (
    reservation_id, member_id, item_id, unit_id, quantity, linked_booking_id,
    reservation_status, start_time_epoch, end_time_epoch, description, created_by, updated_by
)
SELECT 'resv1', 'Matti1', 'INV_VEST', NULL, 2, 'stl1',
       'CONFIRMED', b.start_time_epoch, b.end_time_epoch,
       'Two vests for the passengers', 'Matti1', 'Matti1'
  FROM schedule.bookings b
 WHERE b.booking_id = 'stl1';

INSERT INTO inventory.reservations (
    reservation_id, member_id, item_id, unit_id, quantity, linked_booking_id,
    reservation_status, start_time_epoch, end_time_epoch, description,
    created_by, updated_by, cancelled_at, cancelled_by, cancellation_note
) VALUES
  -- A specific-unit reservation: the tank with tag OX-A, not just any tank.
  (
    'resv2', 'Liisa1', 'INV_O2', 'O2A', 1, NULL, 'CONFIRMED',
    EXTRACT(EPOCH FROM (current_date + INTERVAL '2 days' + INTERVAL '10 hours')),
    EXTRACT(EPOCH FROM (current_date + INTERVAL '2 days' + INTERVAL '12 hours')),
    'Mountain flight', 'Liisa1', 'Liisa1', NULL, NULL, NULL
  ),
  -- Already over, so it must not block anything in the future.
  (
    'resv3', 'Matti1', 'INV_VEST', NULL, 1, NULL, 'CONFIRMED',
    EXTRACT(EPOCH FROM (current_date - INTERVAL '5 days' + INTERVAL '9 hours')),
    EXTRACT(EPOCH FROM (current_date - INTERVAL '5 days' + INTERVAL '15 hours')),
    'Last week''s coastal flight', 'Matti1', 'Matti1', NULL, NULL, NULL
  ),
  -- Cancelled, so it must not count against capacity either.
  (
    'resv4', 'Kaisa1', 'INV_VEST', NULL, 1, NULL, 'CANCELLED',
    EXTRACT(EPOCH FROM (current_date + INTERVAL '3 days' + INTERVAL '8 hours')),
    EXTRACT(EPOCH FROM (current_date + INTERVAL '3 days' + INTERVAL '18 hours')),
    'Changed my mind', 'Kaisa1', 'Kaisa1', NOW(), 'Kaisa1', 'Flight cancelled'
  );
