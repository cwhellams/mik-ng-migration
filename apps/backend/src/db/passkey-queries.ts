import { db } from './connection.ts'

const CHALLENGE_TTL_SECONDS = 5 * 60 // 5 minutes — WebAuthn ceremonies are quick

export type PasskeyRow = {
  id: string
  memberId: string
  credentialId: string
  publicKey: Buffer
  counter: number
  transports: string[]
  deviceType: string | null
  backedUp: boolean
  name: string | null
  lastUsedAt: string | null
  createdAt: string
}

const mapRow = (r: {
  id: string
  member_id: string
  credential_id: string
  public_key: Buffer | Uint8Array
  counter: string | number
  transports: string[]
  device_type: string | null
  backed_up: boolean
  name: string | null
  last_used_at: Date | string | null
  created_at: Date | string
}): PasskeyRow => ({
  id: r.id,
  memberId: r.member_id,
  credentialId: r.credential_id,
  publicKey: Buffer.isBuffer(r.public_key) ? r.public_key : Buffer.from(r.public_key),
  counter: typeof r.counter === 'string' ? Number(r.counter) : r.counter,
  transports: r.transports ?? [],
  deviceType: r.device_type,
  backedUp: r.backed_up,
  name: r.name,
  lastUsedAt: r.last_used_at ? new Date(r.last_used_at).toISOString() : null,
  createdAt: new Date(r.created_at).toISOString(),
})

export async function getPasskeysByMemberId(memberId: string): Promise<PasskeyRow[]> {
  const rows = await db
    .selectFrom('member.passkeys')
    .selectAll()
    .where('member_id', '=', memberId)
    .orderBy('created_at', 'desc')
    .execute()
  return rows.map(mapRow)
}

export async function getPasskeyByCredentialId(
  credentialId: string,
): Promise<PasskeyRow | undefined> {
  const row = await db
    .selectFrom('member.passkeys')
    .selectAll()
    .where('credential_id', '=', credentialId)
    .executeTakeFirst()
  return row ? mapRow(row) : undefined
}

/** Look up a passkey by its id (regardless of owning member). */
export async function getPasskeyById(id: string): Promise<PasskeyRow | undefined> {
  const row = await db
    .selectFrom('member.passkeys')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst()
  return row ? mapRow(row) : undefined
}

export async function insertPasskey(input: {
  memberId: string
  credentialId: string
  publicKey: Uint8Array
  counter: number
  transports: string[]
  deviceType: string | null
  backedUp: boolean
  name: string | null
}): Promise<string> {
  const result = await db
    .insertInto('member.passkeys')
    .values({
      member_id: input.memberId,
      credential_id: input.credentialId,
      public_key: Buffer.from(input.publicKey),
      counter: input.counter,
      transports: input.transports,
      device_type: input.deviceType,
      backed_up: input.backedUp,
      name: input.name,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return result.id
}

/**
 * Persist the new authenticator counter and bump last_used_at. The counter
 * monotonicity check that detects cloned authenticators is performed by
 * `@simplewebauthn/server`'s `verifyAuthenticationResponse` before this is
 * called: when both stored and reported counters are non-zero, the library
 * throws if `newCounter <= storedCounter`. Many platform passkeys (e.g.
 * synced iCloud Keychain / Google Password Manager passkeys) deliberately
 * report a counter of 0 — in that case spec says clone detection is not
 * possible and the library accepts it.
 */
export async function updatePasskeyCounter(id: string, counter: number): Promise<void> {
  await db
    .updateTable('member.passkeys')
    .set({ counter, last_used_at: new Date() })
    .where('id', '=', id)
    .execute()
}

export async function renamePasskey(id: string, memberId: string, name: string): Promise<boolean> {
  const result = await db
    .updateTable('member.passkeys')
    .set({ name })
    .where('id', '=', id)
    .where('member_id', '=', memberId)
    .executeTakeFirst()
  return Number(result.numUpdatedRows) > 0
}

/** Delete a passkey owned by the given member. Returns true if a row was removed. */
export async function deletePasskey(id: string, memberId: string): Promise<boolean> {
  const result = await db
    .deleteFrom('member.passkeys')
    .where('id', '=', id)
    .where('member_id', '=', memberId)
    .executeTakeFirst()
  return Number(result.numDeletedRows) > 0
}

/** Admin variant: delete a passkey by id without scoping to member. */
export async function deletePasskeyById(id: string): Promise<boolean> {
  const result = await db.deleteFrom('member.passkeys').where('id', '=', id).executeTakeFirst()
  return Number(result.numDeletedRows) > 0
}

// --- WebAuthn challenges -----------------------------------------------------

export type WebAuthnChallengePurpose = 'registration' | 'authentication'

export async function storeChallenge(input: {
  memberId: string | null
  email: string | null
  purpose: WebAuthnChallengePurpose
  challenge: string
}): Promise<void> {
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_SECONDS * 1000)

  // The table has partial unique indexes on (member_id, purpose) and
  // (email, purpose), so an INSERT … ON CONFLICT replaces any previous
  // challenge atomically — no race window between DELETE and INSERT.
  if (input.memberId) {
    await db
      .insertInto('member.webauthn_challenges')
      .values({
        member_id: input.memberId,
        email: input.email ? input.email.toLowerCase() : null,
        purpose: input.purpose,
        challenge: input.challenge,
        expires_at: expiresAt,
      })
      .onConflict(oc =>
        oc
          .columns(['member_id', 'purpose'])
          .where('member_id', 'is not', null)
          .doUpdateSet({
            challenge: input.challenge,
            email: input.email ? input.email.toLowerCase() : null,
            expires_at: expiresAt,
            created_at: new Date(),
          }),
      )
      .execute()
  } else if (input.email) {
    await db
      .insertInto('member.webauthn_challenges')
      .values({
        member_id: null,
        email: input.email.toLowerCase(),
        purpose: input.purpose,
        challenge: input.challenge,
        expires_at: expiresAt,
      })
      .onConflict(oc =>
        oc.columns(['email', 'purpose']).where('email', 'is not', null).doUpdateSet({
          challenge: input.challenge,
          expires_at: expiresAt,
          created_at: new Date(),
        }),
      )
      .execute()
  }
}

/**
 * Atomically claim and remove the challenge matching the given
 * principal+purpose. The partial unique indexes guarantee at most one row
 * exists, so a simple DELETE … RETURNING is safe. Returns the challenge
 * string on success or undefined if no fresh challenge is found.
 */
export async function claimChallenge(input: {
  memberId: string | null
  email: string | null
  purpose: WebAuthnChallengePurpose
}): Promise<string | undefined> {
  if (!input.memberId && !input.email) {
    return undefined
  }

  let query = db
    .deleteFrom('member.webauthn_challenges')
    .where('purpose', '=', input.purpose)
    .where('expires_at', '>', new Date())

  if (input.memberId) {
    query = query.where('member_id', '=', input.memberId)
  } else {
    query = query.where('email', '=', input.email!.toLowerCase())
  }

  const rows = await query.returning('challenge').execute()
  return rows.length > 0 ? rows[0].challenge : undefined
}

/** Periodic cleanup helper — also called opportunistically during reads. */
export async function deleteExpiredChallenges(): Promise<void> {
  await db.deleteFrom('member.webauthn_challenges').where('expires_at', '<=', new Date()).execute()
}
