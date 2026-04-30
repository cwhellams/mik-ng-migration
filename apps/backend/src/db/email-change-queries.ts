import { db } from './connection.ts'

/**
 * Delete any unused (not yet verified) pending email change requests for a member.
 * Called before creating a new request to ensure only one is active at a time.
 */
export async function invalidatePreviousEmailChanges(memberId: string): Promise<void> {
  await db
    .deleteFrom('member.pending_email_changes')
    .where('member_id', '=', memberId)
    .where('used_at', 'is', null)
    .execute()
}

/**
 * Create a new pending email change request.
 * Invalidates any existing pending changes for the same member first.
 */
export async function createPendingEmailChange(
  memberId: string,
  newEmail: string,
  tokenHash: string,
  expiresAt: Date,
): Promise<string> {
  await invalidatePreviousEmailChanges(memberId)

  const result = await db
    .insertInto('member.pending_email_changes')
    .values({
      member_id: memberId,
      new_email: newEmail.toLowerCase(),
      token_hash: tokenHash,
      expires_at: expiresAt,
    })
    .returning('id')
    .executeTakeFirstOrThrow()

  return result.id
}

/**
 * Atomically claim a pending email change by its token hash.
 * The UPDATE only succeeds when the row has not yet been used AND has not expired,
 * which prevents replay attacks even under concurrent requests.
 * Returns the claimed row, or undefined if the token is invalid/used/expired.
 */
export async function claimPendingEmailChangeByTokenHash(tokenHash: string) {
  return db
    .updateTable('member.pending_email_changes')
    .set({ used_at: new Date() })
    .where('token_hash', '=', tokenHash)
    .where('used_at', 'is', null)
    .where('expires_at', '>', new Date())
    .returningAll()
    .executeTakeFirst()
}
