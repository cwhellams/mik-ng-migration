/**
 * Fixture builders for admin-app tests.
 *
 * The member, role and permission builders are shared with `apps/frontend`
 * through `@mik/ui` — a permission-gate test needs exactly the same cast on
 * both sides, and two copies would drift. Re-exported here so call sites read
 * `../../test/fixtures` the way they do in the member app.
 */
export * from '@mik/ui/test/fixtures/cast'
export * from '@mik/ui/test/fixtures/roles'
export * from '@mik/ui/test/fixtures/members'
export * from '@mik/ui/test/fixtures/flightLogs'
