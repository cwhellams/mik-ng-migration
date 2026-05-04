/**
 * Passkey (WebAuthn) authentication routes.
 *
 * The implementation supports both platform authenticators (Windows Hello,
 * Face ID, Touch ID, Android biometrics) and roaming/cross-platform
 * authenticators (YubiKey and other security keys). To achieve this we:
 *
 *  - do not constrain `authenticatorSelection.authenticatorAttachment`
 *  - request `userVerification: 'preferred'` so older hardware keys that
 *    cannot perform UV (e.g. YubiKey 5 without PIN/biometric) still register
 *  - request `residentKey: 'preferred'` so newer keys/passkeys store
 *    discoverable credentials while older keys can still register a
 *    server-side credential
 */
import { randomUUID } from 'node:crypto'
import { Router, type Request, type Response } from 'express'
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
  type AuthenticatorTransportFuture,
  type WebAuthnCredential,
} from '@simplewebauthn/server'

import { generateJWTUser, respondWithAccessAndRefreshToken, type JWTUser } from './token.ts'
import { getMemberByEmail, getMemberById } from '../../db/member-queries.ts'
import {
  claimChallenge,
  deletePasskey,
  deletePasskeyById,
  getPasskeyByCredentialId,
  getPasskeyById,
  getPasskeysByMemberId,
  insertPasskey,
  renamePasskey,
  storeChallenge,
  updatePasskeyCounter,
} from '../../db/passkey-queries.ts'
import { createLoginEvent } from '../../db/auth-queries.ts'
import logger from '../../lib/logger.ts'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '../members/models.ts'

export const passkeyRouter = Router()
export const memberPasskeysRouter = Router({ mergeParams: true })

/** Resolve relying-party (RP) configuration from environment. */
function rpConfig(): { rpId: string; rpName: string; origin: string[] } {
  const publicUrl = process.env.PUBLIC_URL
  if (!publicUrl) {
    throw new Error('PUBLIC_URL is not defined in environment variables')
  }
  const url = new URL(publicUrl)

  // RP ID is the registrable domain (no scheme/port). It can be overridden
  // for non-standard deployments via WEBAUTHN_RP_ID.
  const rpId = process.env.WEBAUTHN_RP_ID ?? url.hostname

  const rpName = process.env.WEBAUTHN_RP_NAME ?? 'MIK'

  // Allow overriding the expected origin for development (e.g. allow both
  // http://localhost:5173 and http://127.0.0.1:5173). Comma-separated list.
  const origins = process.env.WEBAUTHN_ORIGIN
    ? process.env.WEBAUTHN_ORIGIN.split(',').map(o => o.trim())
    : [url.origin]

  return { rpId, rpName, origin: origins }
}

// ---------------------------------------------------------------------------
// Registration (authenticated members add a passkey to their account)
// ---------------------------------------------------------------------------

passkeyRouter.post('/registration/options', validateUser(), async (req: Request, res: Response) => {
  const user = req.user as JWTUser
  const { rpId, rpName } = rpConfig()

  // Exclude passkeys the user already has so the same authenticator is not
  // registered twice.
  const existing = await getPasskeysByMemberId(user.memberId)

  const options = await generateRegistrationOptions({
    rpName,
    rpID: rpId,
    // userID must be a stable, non-PII byte sequence. Use the memberId.
    userID: new TextEncoder().encode(user.memberId),
    userName: user.email,
    userDisplayName: `${user.email}`,
    attestationType: 'none',
    excludeCredentials: existing.map(p => ({
      id: p.credentialId,
      transports: p.transports as AuthenticatorTransportFuture[],
    })),
    // Accept BOTH platform and cross-platform authenticators (YubiKey etc.).
    // Do not set authenticatorAttachment.
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
      requireResidentKey: false,
    },
    // Allow ES256 (most common, incl. YubiKey) and RS256 (older Windows Hello).
    supportedAlgorithmIDs: [-7, -257],
  })

  await storeChallenge({
    memberId: user.memberId,
    email: null,
    purpose: 'registration',
    challenge: options.challenge,
  })

  res.json(options)
})

passkeyRouter.post('/registration/verify', validateUser(), async (req: Request, res: Response) => {
  const user = req.user as JWTUser
  const { rpId, origin } = rpConfig()

  const response = req.body?.response as RegistrationResponseJSON | undefined
  const name = typeof req.body?.name === 'string' ? req.body.name.slice(0, 100) : null
  if (!response) {
    return res.status(400).json({ error: 'Missing registration response' })
  }

  const expectedChallenge = await claimChallenge({
    memberId: user.memberId,
    email: null,
    purpose: 'registration',
  })
  if (!expectedChallenge) {
    return res.status(400).json({ error: 'Registration challenge not found or expired' })
  }

  let verification
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpId,
      requireUserVerification: false,
    })
  } catch (err) {
    logger.warn('Passkey registration verify failed for %s: %s', user.memberId, err)
    return res.status(400).json({ error: 'Passkey registration failed' })
  }

  if (!verification.verified || !verification.registrationInfo) {
    return res.status(400).json({ error: 'Passkey registration failed' })
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo

  // Reject if the credential is somehow already registered (to anyone).
  const existing = await getPasskeyByCredentialId(credential.id)
  if (existing) {
    return res.status(409).json({ error: 'This passkey is already registered' })
  }

  const passkeyId = await insertPasskey({
    memberId: user.memberId,
    credentialId: credential.id,
    publicKey: credential.publicKey,
    counter: credential.counter,
    transports: (credential.transports ?? []) as string[],
    deviceType: credentialDeviceType ?? null,
    backedUp: credentialBackedUp ?? false,
    name,
  })

  await createLoginEvent(user.memberId, 'passkey_registered', req.ip, req.headers['user-agent'])

  res.json({ ok: true, id: passkeyId })
})

// ---------------------------------------------------------------------------
// Authentication (login with passkey)
// ---------------------------------------------------------------------------

passkeyRouter.post('/authentication/options', async (req: Request, res: Response) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : null
  const { rpId } = rpConfig()

  let allowCredentials: { id: string; transports?: AuthenticatorTransportFuture[] }[] = []
  let memberIdForChallenge: string | null = null
  // For the discoverable (email-less) flow we generate a random session token
  // and store the challenge under it so we can look it up during verify.
  let sessionId: string | null = null

  if (email) {
    // Email-scoped flow: pre-populate allowCredentials with the member's
    // passkeys so the browser can select the right one directly.
    // We deliberately do NOT leak whether the email exists — if there are no
    // credentials we still issue an options object (with empty allowCredentials).
    const member = await getMemberByEmail(email)
    if (member) {
      const passkeys = await getPasskeysByMemberId(member.memberId)
      allowCredentials = passkeys.map(p => ({
        id: p.credentialId,
        transports: p.transports as AuthenticatorTransportFuture[],
      }))
      memberIdForChallenge = member.memberId
    }
  } else {
    // Discoverable (usernameless) flow: empty allowCredentials lets the
    // browser surface any stored passkey for this RP. We generate a unique
    // session token so the challenge can be claimed during verify.
    sessionId = randomUUID()
  }

  const options = await generateAuthenticationOptions({
    rpID: rpId,
    allowCredentials,
    userVerification: 'preferred',
  })

  // Store the challenge. For the email-scoped flow the principal is the
  // member (or their email when the member could not be resolved). For the
  // discoverable flow the session token acts as a single-use opaque key in
  // the email column — it is a UUID rather than an email address, but the
  // column type is VARCHAR(100) with no format constraint. This dual-purpose
  // usage is intentional and documented here; no downstream code performs
  // email-format validation on webauthn_challenges.email.
  await storeChallenge({
    memberId: memberIdForChallenge,
    email: sessionId ?? email,
    purpose: 'authentication',
    challenge: options.challenge,
  })

  // Tell the client whether the user appears to have at least one passkey.
  // Also return the session token for the discoverable flow so the client can
  // pass it back in the verify request.
  res.json({
    options,
    hasPasskeys: allowCredentials.length > 0,
    ...(sessionId ? { sessionId } : {}),
  })
})

passkeyRouter.post('/authentication/verify', async (req: Request, res: Response) => {
  const response = req.body?.response as AuthenticationResponseJSON | undefined
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : null
  const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : null
  if (!response) {
    return res.status(400).json({ error: 'Missing authentication response' })
  }

  const credentialId = response.id
  const passkey = await getPasskeyByCredentialId(credentialId)
  if (!passkey) {
    logger.warn('Passkey authentication: unknown credential %s', credentialId)
    await createLoginEvent(null, 'passkey_login_failed', req.ip, req.headers['user-agent'])
    return res.status(401).json({ error: 'Authentication failed' })
  }

  // Look up the challenge for the actual owner of the credential.
  // 1. Primary path: challenge stored keyed to the member (email-scoped flow).
  // 2. Discoverable flow: challenge stored under the session token returned by
  //    the options endpoint and passed back by the client.
  // 3. Legacy fallback: challenge stored keyed to the typed email.
  // claimChallenge returns undefined when both memberId and email are null, so
  // the null sessionId / null email cases fall through naturally.
  const expectedChallenge =
    (await claimChallenge({
      memberId: passkey.memberId,
      email: null,
      purpose: 'authentication',
    })) ??
    (await claimChallenge({ memberId: null, email: sessionId, purpose: 'authentication' })) ??
    (await claimChallenge({ memberId: null, email, purpose: 'authentication' }))

  if (!expectedChallenge) {
    await createLoginEvent(
      passkey.memberId,
      'passkey_login_failed',
      req.ip,
      req.headers['user-agent'],
    )
    return res.status(400).json({ error: 'Authentication challenge not found or expired' })
  }

  const { rpId, origin } = rpConfig()

  const credential: WebAuthnCredential = {
    id: passkey.credentialId,
    publicKey: new Uint8Array(passkey.publicKey),
    counter: passkey.counter,
    transports: passkey.transports as AuthenticatorTransportFuture[],
  }

  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpId,
      credential,
      requireUserVerification: false,
    })
  } catch (err) {
    logger.warn('Passkey authentication verify failed: %s', err)
    await createLoginEvent(
      passkey.memberId,
      'passkey_login_failed',
      req.ip,
      req.headers['user-agent'],
    )
    return res.status(401).json({ error: 'Authentication failed' })
  }

  if (!verification.verified) {
    await createLoginEvent(
      passkey.memberId,
      'passkey_login_failed',
      req.ip,
      req.headers['user-agent'],
    )
    return res.status(401).json({ error: 'Authentication failed' })
  }

  await updatePasskeyCounter(passkey.id, verification.authenticationInfo.newCounter)

  const member = await getMemberById(passkey.memberId)
  if (!member) {
    return res.status(401).json({ error: 'Authentication failed' })
  }

  const jwtUser = generateJWTUser(member)
  await createLoginEvent(
    member.memberId,
    'passkey_login_success',
    req.ip,
    req.headers['user-agent'],
  )
  respondWithAccessAndRefreshToken(jwtUser, res)
})

// ---------------------------------------------------------------------------
// Passkey management — own passkeys (mounted at /api/v1/members/me/passkeys)
// and admin (mounted at /api/v1/members/:memberId/passkeys).
// ---------------------------------------------------------------------------

type PasskeyDto = {
  id: string
  name: string | null
  deviceType: string | null
  backedUp: boolean
  transports: string[]
  lastUsedAt: string | null
  createdAt: string
}

const toDto = (p: Awaited<ReturnType<typeof getPasskeysByMemberId>>[number]): PasskeyDto => ({
  id: p.id,
  name: p.name,
  deviceType: p.deviceType,
  backedUp: p.backedUp,
  transports: p.transports,
  lastUsedAt: p.lastUsedAt,
  createdAt: p.createdAt,
})

memberPasskeysRouter.get('/', validateUser(), async (req: Request, res: Response) => {
  const user = req.user as JWTUser
  const requested = req.params.memberId
  const isSelf = !requested || requested === 'me' || requested === user.memberId
  const targetMemberId = isSelf
    ? user.memberId
    : (() => {
        if (!user.permissions.includes(MIKPermissions.MEMBER_ADMIN)) {
          return null
        }
        return requested
      })()

  if (targetMemberId === null) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const passkeys = await getPasskeysByMemberId(targetMemberId)
  res.json({ passkeys: passkeys.map(toDto) })
})

memberPasskeysRouter.patch('/:passkeyId', validateUser(), async (req: Request, res: Response) => {
  const user = req.user as JWTUser
  const requested = req.params.memberId
  const isSelf = !requested || requested === 'me' || requested === user.memberId
  if (!isSelf) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const name = typeof req.body?.name === 'string' ? req.body.name.slice(0, 100) : null
  if (!name) {
    return res.status(400).json({ error: 'Name is required' })
  }
  const ok = await renamePasskey(req.params.passkeyId, user.memberId, name)
  if (!ok) {
    return res.status(404).json({ error: 'Passkey not found' })
  }
  res.json({ ok: true })
})

memberPasskeysRouter.delete('/:passkeyId', validateUser(), async (req: Request, res: Response) => {
  const user = req.user as JWTUser
  const requested = req.params.memberId
  const isSelf = !requested || requested === 'me' || requested === user.memberId
  const isAdmin = user.permissions.includes(MIKPermissions.MEMBER_ADMIN)

  if (!isSelf && !isAdmin) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  // Look up the passkey first so the audit-log entry below records the
  // correct owning memberId even when an admin is removing somebody else's
  // passkey. This also lets us return 404 for unknown ids rather than
  // silently succeeding with the wrong owner.
  const target = await getPasskeyById(req.params.passkeyId)
  if (!target) {
    return res.status(404).json({ error: 'Passkey not found' })
  }
  // Self-delete must match the actual owner
  if (isSelf && target.memberId !== user.memberId) {
    return res.status(404).json({ error: 'Passkey not found' })
  }

  const ok = isSelf
    ? await deletePasskey(req.params.passkeyId, user.memberId)
    : await deletePasskeyById(req.params.passkeyId)

  if (!ok) {
    return res.status(404).json({ error: 'Passkey not found' })
  }

  await createLoginEvent(target.memberId, 'passkey_removed', req.ip, req.headers['user-agent'])

  res.json({ ok: true })
})
