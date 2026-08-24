import type { Auditable } from '@mik/contracts/schema'

/**
 * The shared cast of characters.
 *
 * These are the same entities the backend suite uses (`apps/backend/test/routes/*`)
 * and the same ones seeded by the Flyway test data in `sql/schema/testdata/`.
 * Keeping the IDs identical on both sides means a developer reading a frontend
 * test recognises the entities from the backend one without re-learning a
 * second set of names.
 */

/** Club admin — `k1mnimda`. Owns most audit trails in the seeded data. */
export const ADMIN_MEMBER_ID = 'k1mnimda'

/** The everyman member — Matti Virtanen, `Matti1`. Flying member with a licence. */
export const MEMBER_ID = 'Matti1'

/** Liisa Korhonen, `Liisa1`. Used as the no-permissions case. */
export const NO_PERMISSIONS_MEMBER_ID = 'Liisa1'

/** Jukka Nieminen, `Jukka1`. The instructor. */
export const INSTRUCTOR_MEMBER_ID = 'Jukka1'

/** Diamond DA40, `OH-STL`. The club's main aircraft in the seeded data. */
export const AIRCRAFT_REGISTRATION = 'OH-STL'

/**
 * Fixed timestamp for every audit field, so fixtures never depend on the wall
 * clock and snapshots of formatted dates stay stable.
 */
export const FIXTURE_TIMESTAMP = '2025-01-01T00:00:00.000Z'

/**
 * A date `months` from today, as `YYYY-MM-DD`.
 *
 * The deliberate exception to `FIXTURE_TIMESTAMP`'s rule. Currency dates —
 * licence and medical expiry — are not arbitrary values a fixture can pin: they
 * decide whether the member may fly at all, and `aMember()` is meant to be a
 * *current* member. Written as fixed dates they silently expired, and code that
 * reads them (`EditBookingModal` blocks a booking outright on an expired
 * medical) began exercising the lapsed-member path in tests that had nothing to
 * do with currency. Any test that cares about a specific date still overrides it.
 */
export const monthsFromToday = (months: number): string => {
  const date = new Date()
  date.setUTCMonth(date.getUTCMonth() + months)
  return date.toISOString().slice(0, 10)
}

/** Audit fields every `Auditable` entity carries. Mirrors `test/util/helpers.ts` on the backend. */
export const auditFields = (by: string = ADMIN_MEMBER_ID): Auditable => ({
  createdAt: FIXTURE_TIMESTAMP,
  createdBy: by,
  updatedAt: FIXTURE_TIMESTAMP,
  updatedBy: by,
})
