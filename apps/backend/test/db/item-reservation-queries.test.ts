import { ItemReservationStatus } from '@mik/contracts/inventory-reservations'
import dayjs from 'dayjs'

import { db } from '../../src/db/connection.ts'
import * as reservations from '../../src/db/item-reservation-queries.ts'
import * as units from '../../src/db/item-unit-queries.ts'
import type { JWTUser } from '../../src/routes/auth/token.ts'

/**
 * The capacity trigger (V2030) and the query layer over it (#1139).
 *
 * `inventory.check_reservation_capacity()` is the only authority on whether a
 * reservation fits, so these tests drive it directly rather than through the
 * routes: the arithmetic that has to hold — pooled and specific-unit
 * reservations counted together, cancelled ones not counted, units out of
 * service not counted — is where a change could silently over-book the club.
 *
 * The seeded cast comes from `sql/schema/testdata/V340`: item `INV_VEST` has
 * six units of which four hold capacity (one is in MAINTENANCE, one retired),
 * `INV_O2` has two, and `INV_PAPER` is deliberately not reservable.
 */

const jwt: JWTUser = {
  memberId: 'k1mnimda',
  lastName: 'Admin',
  email: 'admin@mik.fi',
  roles: [],
  permissions: [],
  canMakeReservations: true,
}

/** A window far enough out that no seeded reservation overlaps it. */
const window = (dayOffset: number, hours = 2) => {
  const start = dayjs().add(dayOffset, 'day').startOf('hour')
  return {
    startTimeEpoch: start.unix().toString(),
    endTimeEpoch: start.add(hours, 'hour').unix().toString(),
  }
}

const created: string[] = []

const reserve = async (
  overrides: Partial<Parameters<typeof reservations.insertReservation>[0]> & {
    startTimeEpoch: string
    endTimeEpoch: string
  },
) => {
  const reservation = await reservations.insertReservation(
    {
      memberId: 'Matti1',
      itemId: 'INV_VEST',
      unitId: null,
      quantity: 1,
      linkedBookingId: null,
      status: ItemReservationStatus.CONFIRMED,
      description: undefined,
      ...overrides,
    },
    jwt,
  )
  created.push(reservation.reservationId)
  return reservation
}

afterEach(async () => {
  if (created.length === 0) return
  await db
    .deleteFrom('inventory.reservations')
    .where('reservationId', 'in', created.splice(0))
    .execute()
})

describe('in-service unit counting', () => {
  it('counts only units that are active and in a status that holds capacity', async () => {
    // Six vests seeded: four AVAILABLE, one MAINTENANCE, one RETIRED+inactive.
    await expect(units.getInServiceUnitCount('INV_VEST')).resolves.toBe(4)
    await expect(units.getInServiceUnitCount('INV_O2')).resolves.toBe(2)
  })

  it('is zero for an item with no units at all', async () => {
    await expect(units.getInServiceUnitCount('INV_PAPER')).resolves.toBe(0)
  })
})

describe('reservation capacity trigger', () => {
  it('accepts reservations up to the item’s in-service unit count', async () => {
    const slot = window(30)

    await reserve({ ...slot, quantity: 3 })
    const last = await reserve({ ...slot, quantity: 1 })

    expect(last.quantity).toBe(1)
    await expect(
      reservations.getCommittedQuantity('INV_VEST', slot.startTimeEpoch, slot.endTimeEpoch),
    ).resolves.toBe(4)
  })

  it('rejects the reservation that would exceed it', async () => {
    const slot = window(31)
    await reserve({ ...slot, quantity: 4 })

    await expect(reserve({ ...slot, quantity: 1 })).rejects.toBeInstanceOf(
      reservations.ReservationCapacityError,
    )
  })

  it('rejects an over-capacity request in one go, not just cumulatively', async () => {
    await expect(reserve({ ...window(32), quantity: 5 })).rejects.toThrow(
      /Not enough available units/,
    )
  })

  it('counts a specific-unit reservation against the same pool as a generic one', async () => {
    const slot = window(33)

    await reserve({ ...slot, unitId: 'VEST1' })
    await reserve({ ...slot, quantity: 3 })

    // Four units in service, all four now committed.
    await expect(reserve({ ...slot, quantity: 1 })).rejects.toBeInstanceOf(
      reservations.ReservationCapacityError,
    )
  })

  it('rejects two reservations naming the same unit in overlapping windows', async () => {
    const slot = window(34)
    await reserve({ ...slot, unitId: 'VEST1' })

    // Capacity alone would allow this — three units are still free — so a
    // failure here is the same-unit check, not the pool check.
    await expect(reserve({ ...slot, unitId: 'VEST1' })).rejects.toThrow(
      /already reserved for an overlapping time/,
    )
  })

  it('allows the same unit again once the first reservation has ended', async () => {
    const first = window(35)
    await reserve({ ...first, unitId: 'VEST1' })

    const second = await reserve({
      unitId: 'VEST1',
      startTimeEpoch: first.endTimeEpoch,
      endTimeEpoch: dayjs.unix(Number(first.endTimeEpoch)).add(2, 'hour').unix().toString(),
    })

    expect(second.unitId).toBe('VEST1')
  })

  it('rejects a unit that belongs to a different item', async () => {
    await expect(reserve({ ...window(36), itemId: 'INV_O2', unitId: 'VEST1' })).rejects.toThrow(
      /Unit does not belong to this item/,
    )
  })

  it('does not count cancelled reservations against capacity', async () => {
    const slot = window(37)
    const doomed = await reserve({ ...slot, quantity: 4 })

    await reservations.cancelReservation(doomed.reservationId, jwt, 'Changed plans')

    const replacement = await reserve({ ...slot, quantity: 4 })
    expect(replacement.quantity).toBe(4)
  })

  it('does not count units that have left service', async () => {
    const slot = window(38)
    // VEST5 is in MAINTENANCE, so only four of the six vests hold capacity;
    // asking for five must fail even though six unit rows exist.
    await expect(reserve({ ...slot, quantity: 5 })).rejects.toBeInstanceOf(
      reservations.ReservationCapacityError,
    )
  })

  it('lets a reservation shrink out of the way of another', async () => {
    const slot = window(39)
    const big = await reserve({ ...slot, quantity: 4 })

    await expect(reserve({ ...slot, quantity: 1 })).rejects.toBeInstanceOf(
      reservations.ReservationCapacityError,
    )

    await reservations.updateReservation(big.reservationId, { quantity: 2 }, jwt)

    const shared = await reserve({ ...slot, quantity: 2 })
    expect(shared.quantity).toBe(2)
  })

  it('rejects an update that would push an item over capacity', async () => {
    const slot = window(40)
    const first = await reserve({ ...slot, quantity: 2 })
    await reserve({ ...slot, quantity: 2 })

    await expect(
      reservations.updateReservation(first.reservationId, { quantity: 3 }, jwt),
    ).rejects.toBeInstanceOf(reservations.ReservationCapacityError)
  })
})

describe('reservation reads', () => {
  it('joins the item name and the reserving member', async () => {
    const reservation = await reservations.getReservationById('resv1')

    expect(reservation).toMatchObject({
      reservationId: 'resv1',
      memberId: 'Matti1',
      itemId: 'INV_VEST',
      itemName: { en: 'Life Vest', fi: 'Pelastusliivi', sv: 'Flytväst' },
      quantity: 2,
      linkedBookingId: 'resvbk1',
      status: ItemReservationStatus.CONFIRMED,
      member: { firstName: 'Matti', lastName: 'Virtanen' },
      unitId: null,
      unitTag: null,
    })
  })

  it('joins the tag of a specifically reserved unit', async () => {
    const reservation = await reservations.getReservationById('resv2')

    expect(reservation).toMatchObject({
      reservationId: 'resv2',
      unitId: 'O2A',
      unitTag: 'OX-A',
      unitStatus: 'AVAILABLE',
    })
  })

  it('hides cancelled reservations unless asked for them', async () => {
    const hidden = await reservations.getReservations({ itemId: 'INV_VEST' })
    expect(hidden.map((r) => r.reservationId)).not.toContain('resv4')

    const shown = await reservations.getReservations({
      itemId: 'INV_VEST',
      showCancelled: true,
    })
    expect(shown.map((r) => r.reservationId)).toContain('resv4')
  })

  it('filters to a window by overlap, not by containment', async () => {
    // A window strictly inside resv2 must still find it — the calendar asks for
    // "what is going on this week", not "what starts and ends this week".
    const resv2 = await reservations.getReservationById('resv2')
    const middle = dayjs.unix(Number(resv2!.startTimeEpoch)).add(30, 'minute')

    const found = await reservations.getReservations({
      itemId: 'INV_O2',
      from: middle.toISOString(),
      to: middle.add(15, 'minute').toISOString(),
    })

    expect(found.map((r) => r.reservationId)).toContain('resv2')
  })

  it('filters by several items at once', async () => {
    const found = await reservations.getReservations({
      itemId: ['INV_VEST', 'INV_O2'],
      showCancelled: true,
    })

    expect(new Set(found.map((r) => r.itemId))).toEqual(new Set(['INV_VEST', 'INV_O2']))
  })

  it('finds the reservations riding along with a flight booking', async () => {
    const found = await reservations.getReservationsByLinkedBookingId('resvbk1')
    expect(found.map((r) => r.reservationId)).toEqual(['resv1'])
  })

  it('returns undefined for an unknown id', async () => {
    await expect(reservations.getReservationById('nope')).resolves.toBeUndefined()
  })
})

describe('cancelReservation', () => {
  it('records who cancelled, when, and why', async () => {
    const reservation = await reserve(window(41))

    const cancelled = await reservations.cancelReservation(
      reservation.reservationId,
      jwt,
      'Weather',
    )

    expect(cancelled).toMatchObject({
      status: ItemReservationStatus.CANCELLED,
      cancelledBy: 'k1mnimda',
      cancellationNote: 'Weather',
    })
    expect(cancelled?.cancelledAt).toEqual(expect.any(String))
  })

  it('refuses to cancel the same reservation twice', async () => {
    const reservation = await reserve(window(42))
    await reservations.cancelReservation(reservation.reservationId, jwt)

    await expect(
      reservations.cancelReservation(reservation.reservationId, jwt),
    ).resolves.toBeUndefined()
  })

  it('returns undefined for an unknown reservation', async () => {
    await expect(reservations.cancelReservation('nope', jwt)).resolves.toBeUndefined()
  })
})

describe('updateReservation', () => {
  it('returns undefined for an unknown reservation', async () => {
    await expect(
      reservations.updateReservation('nope', { quantity: 1 }, jwt),
    ).resolves.toBeUndefined()
  })

  it('fills in the cancellation audit trio when the status is patched to CANCELLED', async () => {
    const reservation = await reserve(window(43))

    const updated = await reservations.updateReservation(
      reservation.reservationId,
      { status: ItemReservationStatus.CANCELLED },
      jwt,
    )

    expect(updated).toMatchObject({
      status: ItemReservationStatus.CANCELLED,
      cancelledBy: 'k1mnimda',
    })
    expect(updated?.cancelledAt).toEqual(expect.any(String))
  })
})
