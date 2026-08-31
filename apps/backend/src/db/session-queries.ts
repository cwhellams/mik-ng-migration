import type { SessionRevokeReason } from '@mik/contracts/session'

import { db } from './connection.ts'
import { noExtraKeys } from './rowToContract.ts'

/**
 * Server-side session registry (#1234) -- see V2160__CreateSessionsTable.sql for
 * why it exists and what it deliberately does not do.
 *
 * Split out of auth-queries.ts the same way passkey-queries.ts was: this is one
 * table with one lifecycle, and auth-queries.ts is already the login-attempt and
 * audit-log module.
 */

export type SessionRow = {
  id: string
  memberId: string
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
  lastUsedAt: string
}

const mapRow = (r: {
  id: string
  memberId: string
  ipAddress: string | null
  userAgent: string | null
  createdAt: Date | string
  lastUsedAt: Date | string
}): SessionRow =>
  noExtraKeys({
    ...r,
    createdAt: new Date(r.createdAt).toISOString(),
    lastUsedAt: new Date(r.lastUsedAt).toISOString(),
  })

/**
 * Record a new sign-in. The returned id becomes the refresh token's `jti` and
 * the access token's `sid`, which is the only link between a token and its row.
 */
export async function createSession(
  memberId: string,
  ipAddress: string | undefined,
  userAgent: string | undefined,
): Promise<string> {
  // Both timestamps are written explicitly rather than left to the column
  // defaults, so that they and every later touchSession() are produced the same
  // way. The columns are TIMESTAMP (no zone): CURRENT_TIMESTAMP records the
  // database session's wall clock while a JS Date arrives as the Node process's,
  // and node-pg reads both back as local. On a deployment where both are UTC
  // that is a distinction without a difference, but on a developer's machine in
  // Helsinki it puts "Last active" three hours ahead of "Signed in" on a session
  // that has just been refreshed. One clock for both columns removes it.
  const now = new Date()
  const result = await db
    .insertInto('member.sessions')
    .values({
      memberId,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
      createdAt: now,
      lastUsedAt: now,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return result.id
}

/**
 * Bump `last_used_at` on an active session. Returns false when the id matches no
 * row, or matches a revoked one -- which is the *entire* enforcement of session
 * revocation: `/refresh` is the only place a revoked session is noticed, and a
 * false here is what turns it into a 401.
 *
 * It takes no ip/user-agent: those are fixed at creation on purpose (see the
 * migration), and a parameter that is accepted and then ignored is worse than no
 * parameter at all -- the call site would read as if it still updated them.
 *
 * The id is a UUID from a signed token. A malformed one makes Postgres throw on
 * the cast rather than simply not match, so callers must only pass values that
 * came out of a verified token.
 */
export async function touchSession(id: string): Promise<boolean> {
  const result = await db
    .updateTable('member.sessions')
    .set({ lastUsedAt: new Date() })
    .where('id', '=', id)
    .where('revokedAt', 'is', null)
    .executeTakeFirst()
  return Number(result.numUpdatedRows) > 0
}

/** The member's live sessions, most recently used first. */
export async function getActiveSessionsForMember(memberId: string): Promise<SessionRow[]> {
  const rows = await db
    .selectFrom('member.sessions')
    .select(['id', 'memberId', 'ipAddress', 'userAgent', 'createdAt', 'lastUsedAt'])
    .where('memberId', '=', memberId)
    .where('revokedAt', 'is', null)
    .orderBy('lastUsedAt', 'desc')
    .execute()
  return rows.map(mapRow)
}

/**
 * Look up a session by id regardless of owner or revocation state, so DELETE can
 * tell "not yours" (404) from "already gone" (also 404) and can attribute the
 * audit-log entry to the row's real owner rather than to whoever is calling.
 */
export async function getSessionById(id: string): Promise<SessionRow | undefined> {
  const row = await db
    .selectFrom('member.sessions')
    .select(['id', 'memberId', 'ipAddress', 'userAgent', 'createdAt', 'lastUsedAt'])
    .where('id', '=', id)
    .executeTakeFirst()
  return row ? mapRow(row) : undefined
}

/**
 * Revoke one session. Idempotent by construction: the `revoked_at IS NULL` guard
 * means revoking an already-revoked session updates nothing and returns false,
 * rather than rewriting the reason it originally ended with.
 */
export async function revokeSession(id: string, reason: SessionRevokeReason): Promise<boolean> {
  const result = await db
    .updateTable('member.sessions')
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where('id', '=', id)
    .where('revokedAt', 'is', null)
    .executeTakeFirst()
  return Number(result.numUpdatedRows) > 0
}

/**
 * Revoke every active session of one member except `currentSessionId`, and
 * return how many rows that was.
 *
 * Pass null to exclude nothing -- that is the admin case (an admin acting on
 * somebody else has no "current session" among the target's rows) and also the
 * self case for a member whose token predates this feature and so carries no
 * session id. The member_id filter is what keeps this from ever reaching another
 * member's rows.
 */
export async function revokeOtherSessions(
  memberId: string,
  currentSessionId: string | null,
  reason: SessionRevokeReason,
): Promise<number> {
  const result = await db
    .updateTable('member.sessions')
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where('memberId', '=', memberId)
    .where('revokedAt', 'is', null)
    .$if(!!currentSessionId, (qb) => qb.where('id', '!=', currentSessionId!))
    .executeTakeFirst()
  return Number(result.numUpdatedRows)
}
