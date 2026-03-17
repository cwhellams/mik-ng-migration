import { db } from './connection.ts'
import type { AuthEventType } from './schema.d.ts'

const MAX_FAILED_ATTEMPTS = 5

/** Store a new login attempt. The code must already be bcrypt-hashed by the caller.
 *  linkTokenHash is the SHA-256 hex hash of the opaque random token embedded in the email link. */
export async function createLoginAttempt(
  email: string,
  codeHash: string,
  linkTokenHash: string,
  expiresAt: Date,
  ipAddress: string | undefined,
): Promise<string> {
  const result = await db
    .insertInto('member.login_attempts')
    .values({
      email: email.toLowerCase(),
      code_hash: codeHash,
      link_token_hash: linkTokenHash,
      expires_at: expiresAt,
      ip_address: ipAddress ?? null,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return result.id
}

/** Get the most recent non-expired, non-used login attempt for an email. */
export async function getActiveLoginAttempt(email: string) {
  return db
    .selectFrom('member.login_attempts')
    .selectAll()
    .where('email', '=', email.toLowerCase())
    .where('used_at', 'is', null)
    .where('expires_at', '>', new Date())
    .where('failed_attempts', '<', MAX_FAILED_ATTEMPTS)
    .orderBy('created_at', 'desc')
    .limit(1)
    .executeTakeFirst()
}

/** Mark a login attempt as successfully consumed so it cannot be reused. */
export async function markLoginAttemptUsed(id: string): Promise<void> {
  await db
    .updateTable('member.login_attempts')
    .set({ used_at: new Date() })
    .where('id', '=', id)
    .execute()
}

/** Increment the failed-attempt counter. Returns the new count. */
export async function incrementLoginAttemptFailures(id: string): Promise<number> {
  const result = await db
    .updateTable('member.login_attempts')
    .set(eb => ({ failed_attempts: eb('failed_attempts', '+', 1) }))
    .where('id', '=', id)
    .returning('failed_attempts')
    .executeTakeFirstOrThrow()
  return result.failed_attempts
}

/** Delete all previous login attempts for an email when a new one is requested
 *  (prevents multiple valid attempt rows accumulating). */
export async function invalidatePreviousLoginAttempts(email: string): Promise<void> {
  await db
    .deleteFrom('member.login_attempts')
    .where('email', '=', email.toLowerCase())
    .where('used_at', 'is', null)
    .execute()
}

/**
 * Atomically claim a login attempt by its magic-link token hash.
 * The UPDATE only succeeds when the row has not yet been used AND has not expired,
 * which prevents replay attacks even under concurrent requests.
 * Returns the claimed row, or undefined if the token is invalid/used/expired.
 */
export async function claimLoginAttemptByTokenHash(tokenHash: string) {
  return db
    .updateTable('member.login_attempts')
    .set({ used_at: new Date() })
    .where('link_token_hash', '=', tokenHash)
    .where('used_at', 'is', null)
    .where('expires_at', '>', new Date())
    .returningAll()
    .executeTakeFirst()
}

/** Record an authentication event. memberId may be null for unauthenticated failures. */
export async function createLoginEvent(
  memberId: string | null,
  eventType: AuthEventType,
  ipAddress: string | undefined,
  userAgent: string | undefined,
): Promise<void> {
  await db
    .insertInto('member.login_events')
    .values({
      member_id: memberId ?? null,
      event_type: eventType,
      ip_address: ipAddress ?? null,
      user_agent: userAgent ?? null,
    })
    .execute()
}
