import type { Auditable } from '@backend/types/schema'

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

/** Audit fields every `Auditable` entity carries. Mirrors `test/util/helpers.ts` on the backend. */
export const auditFields = (by: string = ADMIN_MEMBER_ID): Auditable => ({
  createdAt: FIXTURE_TIMESTAMP,
  createdBy: by,
  updatedAt: FIXTURE_TIMESTAMP,
  updatedBy: by,
})
