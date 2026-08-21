import { ItemReservationStatus } from '@mik/contracts/inventory-reservations'
import dayjs from 'dayjs'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { anItemReservation } from '../../test/fixtures'
import { aMember, anAdmin } from '@mik/ui/test/fixtures/members'
import { itemColor, itemReservationFlags, reservationMinDate, reservationTitle } from './helpers'

/**
 * The item calendar's own rules (#1139) — who may edit a reservation, how far
 * back it may be dragged, and what it is called on the grid.
 *
 * These are the counterpart of `sections/schedule/helpers.test.ts`, and
 * deliberately a separate set: an item reservation has no instructor, so
 * "assigned instructor may edit" has no analogue here, and getting that wrong
 * would hand every member an edit button on everyone's equipment.
 */

const NOW = '2025-06-02T12:00:00.000Z'

afterEach(() => {
  vi.useRealTimers()
})

const freezeClock = () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(NOW))
}

describe('reservationMinDate', () => {
  it('rounds up to the next quarter hour for a reservation yet to start', () => {
    freezeClock()
    vi.setSystemTime(new Date('2025-06-02T12:07:30.000Z'))

    expect(reservationMinDate().toISOString()).toBe('2025-06-02T12:15:00.000Z')
  })

  it('locks the start of a reservation that has already begun', () => {
    freezeClock()
    const started = dayjs('2025-06-02T09:00:00.000Z')

    expect(reservationMinDate(started).toISOString()).toBe(started.toISOString())
  })

  it('still rounds up when the reservation starts in the future', () => {
    freezeClock()
    const future = dayjs('2025-06-05T09:00:00.000Z')

    expect(reservationMinDate(future).isAfter(dayjs(NOW))).toBe(true)
    expect(reservationMinDate(future).toISOString()).toBe('2025-06-02T12:15:00.000Z')
  })
})

describe('itemReservationFlags', () => {
  const future = {
    startTimeEpoch: '1780000000',
    startTime: '2026-05-29T08:26:40.000Z',
    endTimeEpoch: '1780007200',
    endTime: '2026-05-29T10:26:40.000Z',
  }

  it('lets the owner edit their own upcoming reservation', () => {
    freezeClock()
    const flags = itemReservationFlags(anItemReservation(future), aMember(), false)

    expect(flags).toMatchObject({ isReadonly: false, isCancelled: false, isPast: false })
  })

  it('does not let another member edit it', () => {
    freezeClock()
    const flags = itemReservationFlags(
      anItemReservation({ ...future, memberId: 'Liisa1' }),
      aMember(),
      false,
    )

    expect(flags.isReadonly).toBe(true)
  })

  it('lets a reservation admin edit anyone’s', () => {
    freezeClock()
    const flags = itemReservationFlags(
      anItemReservation({ ...future, memberId: 'Liisa1' }),
      anAdmin(),
      true,
    )

    expect(flags.isReadonly).toBe(false)
  })

  it('locks a cancelled reservation even for its owner', () => {
    freezeClock()
    const flags = itemReservationFlags(
      anItemReservation({ ...future, status: ItemReservationStatus.CANCELLED }),
      aMember(),
      false,
    )

    expect(flags).toMatchObject({ isReadonly: true, isCancelled: true })
  })

  it('locks a reservation that has already ended', () => {
    freezeClock()
    const flags = itemReservationFlags(anItemReservation(), aMember(), false)

    // The fixture's window is 2025-06-02 09:00–11:00, an hour before `NOW`.
    expect(flags).toMatchObject({ isReadonly: true, isPast: true })
  })

  it('reports a signed-out visitor as unable to edit anything', () => {
    freezeClock()
    const flags = itemReservationFlags(anItemReservation(future), undefined, false)

    expect(flags.isReadonly).toBe(true)
  })
})

describe('itemColor', () => {
  it('gives the same item the same colour every time', () => {
    expect(itemColor('INV_VEST')).toBe(itemColor('INV_VEST'))
  })

  it('gives different items different colours', () => {
    expect(itemColor('INV_VEST')).not.toBe(itemColor('INV_O2'))
  })

  it('produces a colour the browser can use', () => {
    expect(itemColor('INV_VEST')).toMatch(/^hsl\(\d{1,3}, 45%, 45%\)$/)
  })

  it('copes with an empty id rather than producing NaN', () => {
    expect(itemColor('')).toBe('hsl(0, 45%, 45%)')
  })
})

describe('reservationTitle', () => {
  it('leads with the count when more than one unit is reserved', () => {
    expect(reservationTitle(anItemReservation({ quantity: 3 }), 'Life Vest', 'you')).toBe(
      '3× Life Vest — you',
    )
  })

  it('leaves the count off a single-unit reservation', () => {
    expect(reservationTitle(anItemReservation({ quantity: 1 }), 'Life Vest', 'you')).toBe(
      'Life Vest — you',
    )
  })

  it('drops the separator when there is no name to show', () => {
    expect(reservationTitle(anItemReservation({ quantity: 1 }), 'Life Vest', '')).toBe('Life Vest')
  })
})
