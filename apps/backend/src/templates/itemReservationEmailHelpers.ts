import 'dotenv/config'
import { epochToHelsinki } from '@mik/contracts/date'
import type { ItemReservation } from '@mik/contracts/inventory-reservations'

import { normaliseEmailLang } from './renderEmail.ts'

/**
 * The vars every `item-reservation-*.md` template draws on, built once here so
 * the confirmed / updated / cancelled emails describe the same reservation the
 * same way — the counterpart of `bookingEmailVars()` for #1139.
 */

export const itemReservationHref = (reservation: ItemReservation): string =>
  `${process.env.PUBLIC_URL ?? 'http://localhost:5173'}/inventory-reservations?day=${epochToHelsinki(
    reservation.startTimeEpoch,
  ).format('YYYY-MM-DD')}`

export const formatReservationRange = (reservation: ItemReservation): string =>
  `${epochToHelsinki(reservation.startTimeEpoch).format('DD.MM. HH:mm')} - ${epochToHelsinki(
    reservation.endTimeEpoch,
  ).format('DD.MM. HH:mm')}`

/**
 * What the member should see the item called: their own language where the
 * catalog has it, English otherwise. Item names are `{en, fi, sv}` JSONB, so an
 * item added before a translation existed can have a blank entry rather than a
 * missing one — hence the truthiness check rather than `??`.
 */
export const itemDisplayName = (
  itemName: ItemReservation['itemName'],
  lang: string | undefined,
): string => {
  if (!itemName) return ''
  const language = normaliseEmailLang(lang)
  return itemName[language] || itemName.en || ''
}

/**
 * `quantityLabel` is pre-formatted ("3 ×") rather than left to the markdown,
 * because a Handlebars `{{#if}}` around a "×" in three languages is harder to
 * read than one string built here. A single-unit reservation gets an empty
 * string, so the body reads "your Life Vest reservation", not "1 × Life Vest".
 */
export const itemReservationEmailVars = <Extra extends Record<string, unknown>>(
  reservation: ItemReservation,
  lang: string | undefined,
  extra: Extra,
) => ({
  itemName: itemDisplayName(reservation.itemName, lang),
  quantityLabel: reservation.quantity > 1 ? `${reservation.quantity} × ` : '',
  unitTag: reservation.unitTag ?? '',
  reservationTime: formatReservationRange(reservation),
  href: itemReservationHref(reservation),
  ...extra,
})
