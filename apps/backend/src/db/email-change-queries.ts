import { camelDb } from './connection.ts'

/**
 * Delete any unused (not yet verified) pending email change requests for a member.
 * Called before creating a new request to ensure only one is active at a time.
 */
export async function invalidatePreviousEmailChanges(memberId: string): Promise<void> {
  await camelDb
    .deleteFrom('member.pendingEmailChanges')
    .where('memberId', '=', memberId)
    .where('usedAt', 'is', null)
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

  const result = await camelDb
    .insertInto('member.pendingEmailChanges')
    .values({
      memberId: memberId,
      newEmail: newEmail.toLowerCase(),
      tokenHash: tokenHash,
      expiresAt: expiresAt,
    })
    .returning('id')
    .executeTakeFirstOrThrow()

  return result.id
}

/**
 * Atomically claim a pending email change by its token hash, scoped to a specific member.
 * The UPDATE only succeeds when the row has not yet been used, has not expired, AND
 * belongs to the authenticated member — preventing both replay attacks and cross-member
 * token reuse. The token is never consumed if the member ownership check would fail.
 * Returns the claimed row, or undefined if no match.
 */
export async function claimPendingEmailChangeByTokenHash(tokenHash: string, memberId: string) {
  return camelDb
    .updateTable('member.pendingEmailChanges')
    .set({ usedAt: new Date() })
    .where('tokenHash', '=', tokenHash)
    .where('memberId', '=', memberId)
    .where('usedAt', 'is', null)
    .where('expiresAt', '>', new Date())
    .returningAll()
    .executeTakeFirst()
}
