/**
 * Typed fixture builders for frontend tests.
 *
 * Every builder takes an `overrides` object and returns a complete, valid
 * entity, so a test only states the fields it actually cares about:
 *
 * ```ts
 * const expired = aMember({ medicalExpiry: '2020-01-01' })
 * ```
 *
 * The entities mirror the backend's seeded test data — see `@mik/ui`'s
 * `test/fixtures/cast.ts`. The member/role builders live in `@mik/ui` because
 * apps/admin's permission-gate tests need the same ones; the rest are
 * member-app specific and stay here.
 */
export * from '@mik/ui/test/fixtures/cast'
export * from '@mik/ui/test/fixtures/roles'
export * from '@mik/ui/test/fixtures/members'
export * from '@mik/ui/test/fixtures/flightLogs'
export * from '@mik/ui/test/fixtures/inventoryUnits'
export * from './aircraft'
export * from './bookings'
export * from './hil'
export * from './inventoryReservations'
