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
 * The entities mirror the backend's seeded test data — see `./cast.ts`.
 */
export * from './cast'
export * from './roles'
export * from './members'
export * from './aircraft'
export * from './bookings'
export * from './flightLogs'
