import type { InventoryItem } from '@mik/contracts/inventory'
import {
  ItemReservationStatus,
  type ItemReservation,
  type ItemReservationListResponse,
} from '@mik/contracts/inventory-reservations'

import { auditFields, MEMBER_ID } from '@mik/ui/test/fixtures/cast'
import { LIFE_VEST_ITEM_ID } from '@mik/ui/test/fixtures/inventoryUnits'

/**
 * The item reservation cast (#1139), mirroring `sql/schema/testdata/V300`:
 * `INV_VEST` is a group of life vests with per-unit tags, `INV_O2` is a pair of
 * oxygen tanks, and `INV_PAPER` is the consumable that must stay out of the
 * reservation calendar. The unit builders are in `@mik/ui`, since apps/admin
 * needs them too.
 */

export const OXYGEN_TANK_ITEM_ID = 'INV_O2'

/** 2025-06-02 09:00–11:00 UTC — the same fixed window `aBooking()` uses. */
const START = Date.UTC(2025, 5, 2, 9, 0, 0)
const END = Date.UTC(2025, 5, 2, 11, 0, 0)

const epochSeconds = (ms: number) => String(Math.floor(ms / 1000))

export const aReservableItem = (overrides: Partial<InventoryItem> = {}): InventoryItem => ({
  itemId: LIFE_VEST_ITEM_ID,
  categoryId: 'INV_OTHER',
  locationId: 'LOC_MALMI',
  itemType: 'ASSET',
  name: { en: 'Life Vest', fi: 'Pelastusliivi', sv: 'Flytväst' },
  description: null,
  quantity: 4,
  lowStockThreshold: null,
  condition: 'GOOD',
  serialNumber: null,
  imageUrl: null,
  notes: null,
  tags: [],
  isActive: true,
  isReservable: true,

  ...auditFields(),
  ...overrides,
})

/** A confirmed two-vest reservation owned by `Matti1`. */
export const anItemReservation = (overrides: Partial<ItemReservation> = {}): ItemReservation => ({
  reservationId: 'resv1',
  memberId: MEMBER_ID,
  member: { firstName: 'Matti', lastName: 'Virtanen', phoneNumber: '0401234567' },
  itemId: LIFE_VEST_ITEM_ID,
  itemName: { en: 'Life Vest', fi: 'Pelastusliivi', sv: 'Flytväst' },
  unitId: null,
  unitTag: null,
  unitStatus: null,
  quantity: 2,
  linkedBookingId: null,
  status: ItemReservationStatus.CONFIRMED,
  startTimeEpoch: epochSeconds(START),
  startTime: new Date(START).toISOString(),
  endTimeEpoch: epochSeconds(END),
  endTime: new Date(END).toISOString(),
  description: 'Two vests for the passengers',
  cancelledBy: null,
  cancelledAt: null,
  cancellationNote: null,

  ...auditFields(MEMBER_ID),
  ...overrides,
})

export const anItemReservationListResponse = (
  reservations: ItemReservation[] = [anItemReservation()],
): ItemReservationListResponse => ({ reservations })
