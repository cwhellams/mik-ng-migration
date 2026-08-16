import type { Auditable } from '@mik/contracts/schema'

/**
 * The `created_by` / `created_at` / `updated_by` / `updated_at` quadruple appears on
 * most tables in this database, and was written out by hand at every call site — 334
 * occurrences across 31 modules before these helpers existed (issue #1115, phase 5).
 *
 * These cannot be a Kysely plugin: the acting member is request-scoped and there is no
 * AsyncLocalStorage in this backend, so a plugin would have no way to know who is
 * writing. They are call-site helpers by necessity, not by preference.
 *
 * Not every site can use them, and the three that cannot are worth knowing:
 *
 *   - Inserts that set only `createdBy`/`updatedBy` and let the column defaults supply
 *     the timestamps. Using `auditCreate` there would move the clock from Postgres to
 *     the app, which is a behaviour change, not a refactor.
 *   - Mappers whose row is typed `Record<string, unknown>` (`shop-queries`,
 *     `prepaid-hours-queries`). `mapAudit` wants a typed quadruple, and giving it one
 *     means typing those rows properly — the separate `as any` problem from the same
 *     issue, not this one.
 *   - Tables that track only the timestamps, with no `created_by`/`updated_by` columns
 *     at all (`prepaid.member_packages`). A bare `updatedAt: now` next to a sibling
 *     statement using `auditUpdate` looks like an oversight and has been reported as
 *     one; it is the table's shape. Check the schema before "fixing" it.
 */

/** Anything that identifies the acting member — a JWT user, a member row, or a raw id. */
export type Actor = { memberId: string } | string

const actorId = (actor: Actor): string => (typeof actor === 'string' ? actor : actor.memberId)

/**
 * The full quadruple, for INSERT. Both timestamps are the same instant on purpose: a
 * freshly created row whose `updatedAt` differs from its `createdAt` by a millisecond
 * reads as "edited" in the change log.
 *
 * Pass `at` when several rows are inserted as one logical action, so they share a
 * timestamp rather than drifting apart mid-transaction. Its type is preserved: pass a
 * `Date` for a row, or an ISO string when the result is spread into a contract object,
 * whose audit fields are strings.
 *
 * Overloaded rather than generic-with-a-default, because `at: T = new Date() as T`
 * would let a caller write `auditCreate<string>(actor)` and be told the timestamps are
 * strings while the runtime hands back a `Date`.
 */
export function auditCreate(actor: Actor): {
  createdAt: Date
  createdBy: string
  updatedAt: Date
  updatedBy: string
}
export function auditCreate<T extends Date | string>(
  actor: Actor,
  at: T,
): { createdAt: T; createdBy: string; updatedAt: T; updatedBy: string }
export function auditCreate(actor: Actor, at: Date | string = new Date()) {
  const by = actorId(actor)
  return { createdAt: at, createdBy: by, updatedAt: at, updatedBy: by }
}

/**
 * The `updated_*` pair, for UPDATE. Deliberately does not include the `created_*` half:
 * an update that also sets `createdBy` rewrites who created the row, which is exactly
 * the history the audit columns exist to preserve.
 */
export function auditUpdate(actor: Actor): { updatedAt: Date; updatedBy: string }
export function auditUpdate<T extends Date | string>(
  actor: Actor,
  at: T,
): { updatedAt: T; updatedBy: string }
export function auditUpdate(actor: Actor, at: Date | string = new Date()) {
  return { updatedAt: at, updatedBy: actorId(actor) }
}

/** A row's audit columns as the database returns them. */
export type AuditRow = {
  createdAt: Date | string
  createdBy: string
  updatedAt: Date | string
  updatedBy: string
}

// A string is re-parsed rather than passed through: the two hand-written spellings this
// replaces did that, and it matters when the driver hands back a Postgres timestamp
// ("2026-01-02 03:04:05+00") rather than an ISO one — passing that through produces a
// string AuditableSchema's .datetime() check rejects. Re-parsing is identity for input
// that is already ISO, milliseconds included.
const toIso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString()

/**
 * The read-side counterpart: a row's audit columns as the `Auditable` contract shape,
 * with the timestamps serialised.
 *
 * Timestamps are typed `Date | string` because the pool's DATE parser returns some
 * columns as strings, so call sites had grown three spellings of the same conversion
 * (`.toISOString()`, `?.toISOString()`, and an `instanceof Date` ternary that re-parsed
 * the string case). This does not
 * accept `null`: a nullable audit column is a real difference worth seeing at the call
 * site rather than papering over with `?? ''`, which produces a string that fails
 * `AuditableSchema`'s `.datetime()` check anyway.
 */
export const mapAudit = (row: AuditRow): Auditable => ({
  createdAt: toIso(row.createdAt),
  createdBy: row.createdBy,
  updatedAt: toIso(row.updatedAt),
  updatedBy: row.updatedBy,
})
