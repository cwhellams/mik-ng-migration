import { ItemReservationStatus, type ItemReservation } from '@mik/contracts/inventory-reservations'
import dayjs, { Dayjs } from 'dayjs'

import { useMe } from '@mik/ui/hooks/useMe'

/**
 * The item calendar's counterpart to `sections/schedule/helpers.ts`.
 *
 * Deliberately a parallel implementation rather than a shared one: the two
 * calendars agree today only by coincidence of both being calendars, and the
 * booking rules (an assigned instructor may edit, a medical must be current)
 * have no meaning for a life vest. A shared helper would have to grow a flag
 * per difference.
 */

export const reservationMinDate = (startTime?: Dayjs) => {
  const now = dayjs()
  const hasStarted = startTime && startTime.isBefore(now)

  return hasStarted
    ? // Once it has started, the start time is fixed — the vest is already out.
      startTime
    : // Otherwise the next quarter hour.
      now.startOf('minute').add(15 - (now.minute() % 15), 'minute')
}

export const itemReservationFlags = (
  reservation: ItemReservation,
  me: ReturnType<typeof useMe>['me'],
  isReservationAdmin: boolean,
) => {
  const canEdit = reservation.memberId === me?.memberId || isReservationAdmin

  const isCancelled = reservation.status === ItemReservationStatus.CANCELLED
  const isPast = dayjs(reservation.endTime).isBefore()

  return {
    isNewReservation: false,
    isReadonly: !canEdit || isCancelled || isPast,
    isCancelled,
    isPast,
    minDate: reservationMinDate(dayjs(reservation.startTime)),
  }
}

/**
 * A stable colour per item, so the same vest is the same colour every week.
 *
 * Aircraft get hand-picked colours in `sections/schedule` because there are two
 * of them; items are open-ended, so the hue is derived from the id instead. A
 * simple string hash is enough — the only requirement is that it not change
 * between renders or between members.
 */
export const itemColor = (itemId: string): string => {
  let hash = 0
  for (let index = 0; index < itemId.length; index++) {
    hash = (hash * 31 + itemId.charCodeAt(index)) % 360
  }
  return `hsl(${hash}, 45%, 45%)`
}

/**
 * What a reservation is called on the calendar: the item, how many, and who
 * has it. `selfLabel` rather than the member's own name, because a member
 * scanning the week is looking for their own row first.
 */
export const reservationTitle = (
  reservation: ItemReservation,
  itemName: string,
  who: string,
): string =>
  [reservation.quantity > 1 ? `${reservation.quantity}× ${itemName}` : itemName, who]
    .filter(Boolean)
    .join(' — ')
