import { describe, expect, it } from 'vitest'

import {
  ItemReservationCancellationSchema,
  ItemReservationCreateSchema,
  ItemReservationFiltersSchema,
  ItemReservationStatus,
  ItemReservationUpsertSchema,
  reservationInvariantError,
} from '../src/inventory-reservations.ts'
import {
  IN_SERVICE_UNIT_STATUSES,
  isInServiceUnitStatus,
  ItemUnitStatusEnum,
  ItemUnitUpsertSchema,
} from '../src/inventory-units.ts'

/**
 * The item reservation contracts (#1139).
 *
 * Both apps parse against these, and two of the rules below are also enforced
 * by CHECK constraints in `inventory.reservations` — the point of restating
 * them here is that a violation becomes a 400 the client can act on, instead of
 * a 500 out of Postgres.
 */

const validReservation = {
  memberId: 'Matti1',
  itemId: 'INV_VEST',
  unitId: null,
  quantity: 2,
  linkedBookingId: null,
  status: ItemReservationStatus.CONFIRMED,
  startTimeEpoch: '1800000000',
  endTimeEpoch: '1800007200',
  description: 'Two vests',
}

describe('ItemReservationUpsertSchema', () => {
  it('accepts a well-formed reservation', () => {
    expect(ItemReservationUpsertSchema.parse(validReservation)).toMatchObject({
      itemId: 'INV_VEST',
      quantity: 2,
    })
  })

  it('drops fields that are not the client’s to set', () => {
    const parsed = ItemReservationUpsertSchema.parse({
      ...validReservation,
      reservationId: 'forged',
      cancelledBy: 'someone-else',
    })

    expect(parsed).not.toHaveProperty('reservationId')
    expect(parsed).not.toHaveProperty('cancelledBy')
  })

  it('defaults a missing quantity to one unit', () => {
    const { quantity, ...withoutQuantity } = validReservation
    expect(ItemReservationUpsertSchema.parse(withoutQuantity).quantity).toBe(1)
  })

  it('rejects a fractional or negative quantity', () => {
    expect(() =>
      ItemReservationUpsertSchema.parse({ ...validReservation, quantity: 1.5 }),
    ).toThrow()
    expect(() => ItemReservationUpsertSchema.parse({ ...validReservation, quantity: 0 })).toThrow()
    expect(() => ItemReservationUpsertSchema.parse({ ...validReservation, quantity: -1 })).toThrow()
  })

  it('rejects a quantity beyond anything a club could own', () => {
    expect(() =>
      ItemReservationUpsertSchema.parse({ ...validReservation, quantity: 10_000 }),
    ).toThrow()
  })

  it('rejects an epoch that is not a whole number of seconds as a string', () => {
    expect(() =>
      ItemReservationUpsertSchema.parse({ ...validReservation, startTimeEpoch: 1800000000 }),
    ).toThrow()
    expect(() =>
      ItemReservationUpsertSchema.parse({ ...validReservation, startTimeEpoch: 'soon' }),
    ).toThrow()
  })

  it('trims a whitespace-only description away rather than storing padding', () => {
    expect(
      ItemReservationUpsertSchema.parse({ ...validReservation, description: '   ' }).description,
    ).toBeUndefined()
  })
})

describe('reservationInvariantError', () => {
  it('passes a window that runs forwards', () => {
    expect(reservationInvariantError(validReservation)).toBeUndefined()
  })

  it('catches a window that ends before it starts', () => {
    expect(
      reservationInvariantError({
        ...validReservation,
        startTimeEpoch: '1800007200',
        endTimeEpoch: '1800000000',
      }),
    ).toBe('End time must be after start time')
  })

  it('catches a zero-length window', () => {
    expect(
      reservationInvariantError({
        ...validReservation,
        endTimeEpoch: validReservation.startTimeEpoch,
      }),
    ).toBe('End time must be after start time')
  })

  it('catches a specific unit reserved more than once over', () => {
    expect(reservationInvariantError({ ...validReservation, unitId: 'VEST1', quantity: 2 })).toBe(
      'A reservation for a specific unit covers exactly one unit',
    )
  })

  it('allows a specific unit at quantity one', () => {
    expect(
      reservationInvariantError({ ...validReservation, unitId: 'VEST1', quantity: 1 }),
    ).toBeUndefined()
  })
})

describe('ItemReservationCreateSchema', () => {
  it('reports a backwards window against the field that is wrong', () => {
    const result = ItemReservationCreateSchema.safeParse({
      ...validReservation,
      startTimeEpoch: '1800007200',
      endTimeEpoch: '1800000000',
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]).toMatchObject({
      path: ['endTimeEpoch'],
      message: 'End time must be after start time',
    })
  })

  it('reports an over-counted specific unit against the quantity', () => {
    const result = ItemReservationCreateSchema.safeParse({
      ...validReservation,
      unitId: 'VEST1',
      quantity: 3,
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(['quantity'])
  })
})

describe('ItemReservationFiltersSchema', () => {
  it('takes one item or several', () => {
    expect(ItemReservationFiltersSchema.parse({ itemId: 'INV_VEST' }).itemId).toBe('INV_VEST')
    expect(ItemReservationFiltersSchema.parse({ itemId: ['INV_VEST', 'INV_O2'] }).itemId).toEqual([
      'INV_VEST',
      'INV_O2',
    ])
  })

  it('reads showCancelled from the query string’s strings', () => {
    expect(ItemReservationFiltersSchema.parse({ showCancelled: 'true' }).showCancelled).toBe(true)
    expect(ItemReservationFiltersSchema.parse({ showCancelled: 'false' }).showCancelled).toBe(false)
    // Absent stays absent rather than becoming `false`: the field is `.optional()`
    // outside the transform, exactly as on BookingFiltersSchema. Either way the
    // query layer reads it as "don't show cancelled".
    expect(ItemReservationFiltersSchema.parse({}).showCancelled).toBeUndefined()
  })

  it('rejects an unknown filter rather than ignoring it', () => {
    expect(() => ItemReservationFiltersSchema.parse({ registration: 'OH-STL' })).toThrow()
  })

  it('rejects a from/to that is not an ISO datetime', () => {
    expect(() => ItemReservationFiltersSchema.parse({ from: '2026-01-01' })).toThrow()
  })

  it('caps the limit so a caller cannot ask for everything', () => {
    expect(() => ItemReservationFiltersSchema.parse({ limit: '5000' })).toThrow()
    expect(ItemReservationFiltersSchema.parse({ limit: '50' }).limit).toBe(50)
  })
})

describe('ItemReservationCancellationSchema', () => {
  it('accepts an empty body — a reason is welcome, not required', () => {
    expect(ItemReservationCancellationSchema.parse({}).note).toBeUndefined()
  })

  it('rejects a note longer than the column', () => {
    expect(() => ItemReservationCancellationSchema.parse({ note: 'x'.repeat(501) })).toThrow()
  })
})

describe('item unit statuses', () => {
  it('names all six statuses the enum in the database declares', () => {
    expect(ItemUnitStatusEnum.options).toEqual([
      'AVAILABLE',
      'RESERVED',
      'ON_LOAN',
      'MAINTENANCE',
      'LOST',
      'RETIRED',
    ])
  })

  it('counts a reserved or on-loan unit as still in the pool', () => {
    // A vest signed out today is reservable for next week; one in maintenance
    // is not. This mirrors inventory.in_service_unit_count() in V2030.
    expect(IN_SERVICE_UNIT_STATUSES).toEqual(['AVAILABLE', 'RESERVED', 'ON_LOAN'])
    expect(isInServiceUnitStatus('ON_LOAN')).toBe(true)
    expect(isInServiceUnitStatus('MAINTENANCE')).toBe(false)
    expect(isInServiceUnitStatus('LOST')).toBe(false)
    expect(isInServiceUnitStatus('RETIRED')).toBe(false)
  })
})

describe('ItemUnitUpsertSchema', () => {
  it('will not accept a status — that moves through its own endpoint', () => {
    expect(() => ItemUnitUpsertSchema.parse({ itemId: 'INV_O2', status: 'LOST' })).toThrow()
  })

  it('will not accept the audit quadruple either', () => {
    expect(() => ItemUnitUpsertSchema.parse({ itemId: 'INV_O2', createdBy: 'someone' })).toThrow()
  })

  it('folds a whitespace-only tag into no tag at all', () => {
    expect(ItemUnitUpsertSchema.parse({ itemId: 'INV_O2', tag: '  ' }).tag).toBeNull()
  })

  it('trims a real tag', () => {
    expect(ItemUnitUpsertSchema.parse({ itemId: 'INV_O2', tag: ' LV-001 ' }).tag).toBe('LV-001')
  })
})
