import { Router, type Request, type Response, type NextFunction } from 'express'
import { createHash } from 'node:crypto'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { RateLimiterMemory } from 'rate-limiter-flexible'
import dayjs from 'dayjs'

import {
  buildMagicLinkHref,
  generateMagicLinkToken,
  generateLoginCode,
  resolveMagicLinkOrigin,
} from './magiclink.ts'
import { MIKRegistrationVerificationStrategy } from './registration-verification.ts'
import {
  LoginRequestSchema,
  PublicRegisterRequestSchema,
  VerifyCodeRequestSchema,
  type LoginRequest,
  type LoginResponse,
  type RegisterRequest,
} from '@mik/contracts/auth'
import {
  decodeAccessTokenIgnoringExpiry,
  decodeRefreshToken,
  respondWithAccessAndRefreshToken,
  type DecodedRefreshToken,
} from './token.ts'
import { clearAuthCookies, readAccessToken, readRefreshToken } from './cookies.ts'
import { generateJWTUser } from './token.ts'
import {
  addMember,
  getMemberByEmail,
  getMemberById,
  updateMember,
} from '../../db/member-queries.ts'
import {
  claimLoginAttemptByTokenHash,
  createLoginAttempt,
  createLoginEvent,
  getActiveLoginAttempt,
  incrementLoginAttemptFailures,
  invalidatePreviousLoginAttempts,
  markLoginAttemptUsed,
} from '../../db/auth-queries.ts'
import { createSession, revokeSession, touchSession } from '../../db/session-queries.ts'
import { getArticleFees } from '../../db/invoicing-queries.ts'
import {
  ART_JOINING_FEE,
  ART_JUNIOR_JOINING_FEE,
  ART_JUNIOR_MEMBER_FEE_CODE,
  ART_MEMBER_FEE_CODE,
  ART_SUPPORTING_MEMBER_JOINING_FEE,
  ART_SUPPORTING_MEMBER_FEE_CODE,
} from '../../services/accounting/config.ts'
import { resolveArticlePrice } from '../../services/accounting/articlePricing.ts'
import {
  HALF_YEAR_DISCOUNT_PERCENT,
  isAfterMembershipFeeDiscountDate,
} from '../../util/feeDiscounts.ts'
import logger from '../../lib/logger.ts'
import { sendEmail } from '../../lib/sendGmail.ts'
import { renderEmail } from '../../templates/renderEmail.ts'
import { getRandomInt } from '../../util/math-utils.ts'
import { problem } from '../response.ts'
import { verifyTurnstileToken } from '../../services/turnstile.ts'

const registrationVerification = new MIKRegistrationVerificationStrategy()

// Per-email rate limiter: max 5 code-verify attempts per email per 15 minutes.
// Keyed on email so a single attacker IP cannot cycle through many accounts,
// and a single account cannot be brute-forced from many IPs.
const verifyCodeLimiter = new RateLimiterMemory({ points: 5, duration: 15 * 60 })

//
// Routing methods from UI
//
export const router = Router()

const silentFailure = (message: string, res: Response<LoginResponse>): void => {
  logger.warn(message)
  res.status(200).json({ code: getRandomInt(10000, 99999) })
}

// Login existing user — sends magic-link email and stores a hashed code server-side.
// The JWT for the magic link is NEVER returned to the client.
router.post('/login', async (req: Request<LoginRequest>, res: Response<LoginResponse>) => {
  const { email, target, turnstileToken } = LoginRequestSchema.parse(req.body)

  // Verify Turnstile token if provided
  if (turnstileToken) {
    const isValid = await verifyTurnstileToken(turnstileToken, req.ip)
    if (!isValid) {
      logger.warn('Login attempt with invalid Turnstile token from %s', email)
      return res.status(400).json({ error: 'Invalid captcha verification' })
    }
  }

  // Check that we have a member with this email address, to avoid sending magic link to non-existing user.
  // Do not leak information about existing users; if nothing found still return 200 with a random code and log a warning.
  const member = await getMemberByEmail(email)
  if (!member) {
    return silentFailure(
      `An attempt was made to login with email ${email}. No matching member found in database`,
      res,
    )
  }

  // Generate an opaque random token for the email link. Only its SHA-256 hash is
  // stored in the database — the raw token is placed in the email URL only.
  const { token: linkToken, tokenHash: linkTokenHash } = generateMagicLinkToken()
  const code = generateLoginCode()
  const displayCode = getRandomInt(10000, 99999)
  const origin = resolveMagicLinkOrigin(req.get('origin'))
  const href = buildMagicLinkHref(linkToken, origin, target)

  // Invalidate any previous pending attempts and store the new hashed code in the DB.
  // The raw code is never persisted; only a bcrypt hash is stored.
  await invalidatePreviousLoginAttempts(member.email)
  const codeHash = await bcrypt.hash(code.toString(), 10)
  const expiresAt = dayjs().add(15, 'minutes').toDate()
  await createLoginAttempt(member.email, codeHash, linkTokenHash, expiresAt, req.ip)

  const loginMail = renderEmail('login', member.lang, {
    href,
    code,
    firstName: member.firstName,
  })
  sendEmail(member.email, loginMail.subject, loginMail.html)
  logger.info('magic login link sent for %s', member.email)
  if (process.env.NODE_ENV !== 'production') {
    logger.info('DEV magic link for %s: %s | code: %s', member.email, href, code)
  }

  // Only a non-authentic display code is returned to the client (for PWA numeric-entry UX).
  // The real verification code is sent via email and is never exposed in this response.
  return res.json({ code: displayCode })
})

// PWA numeric-code verification endpoint.
router.post('/login/verify-code', async (req: Request, res: Response) => {
  const parseResult = VerifyCodeRequestSchema.safeParse(req.body)
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid request' })
  }
  const { email, code } = parseResult.data

  // Per-email rate limit to prevent brute force
  try {
    await verifyCodeLimiter.consume(email.toLowerCase())
  } catch {
    logger.warn('Rate limit exceeded for verify-code from email %s', email)
    await createLoginEvent(null, 'login_code_max_attempts', req.ip, req.headers['user-agent'])
    return res.status(429).json({ error: 'Too many attempts. Please request a new code.' })
  }

  const member = await getMemberByEmail(email)
  if (!member) {
    logger.warn('verify-code attempt for unknown email %s', email)
    await createLoginEvent(null, 'login_failed', req.ip, req.headers['user-agent'])
    return res.status(401).json({ error: 'Invalid or expired code' })
  }

  const attempt = await getActiveLoginAttempt(email)
  if (!attempt) {
    logger.warn('verify-code: no active attempt found for %s', email)
    await createLoginEvent(member.memberId, 'login_code_expired', req.ip, req.headers['user-agent'])
    return res.status(401).json({ error: 'Invalid or expired code' })
  }

  const codeMatches = bcrypt.compareSync(code, attempt.codeHash)
  if (!codeMatches) {
    const failures = await incrementLoginAttemptFailures(attempt.id)
    logger.warn('verify-code: incorrect code for %s (attempt %d)', email, failures)
    await createLoginEvent(member.memberId, 'login_code_invalid', req.ip, req.headers['user-agent'])
    return res.status(401).json({ error: 'Invalid or expired code' })
  }

  // Mark the attempt as used so it cannot be replayed
  await markLoginAttemptUsed(attempt.id)
  await verifyCodeLimiter.delete(email.toLowerCase())

  // Mark email as verified on first successful login via code, for consistency with magic-link flow
  let verifiedMember = member
  if (!member.emailVerifiedAt) {
    const emailVerifiedAt = new Date().toISOString()
    // generateJWTUser(member) here satisfies the required updated_by audit param in updateMember
    await updateMember(member.memberId, { emailVerifiedAt }, generateJWTUser(member))
    verifiedMember = { ...member, emailVerifiedAt }
  }

  const jwtUser = generateJWTUser(verifiedMember)
  await createLoginEvent(member.memberId, 'login_success', req.ip, req.headers['user-agent'])
  const sessionId = await createSession(member.memberId, req.ip, req.headers['user-agent'])
  respondWithAccessAndRefreshToken(jwtUser, res, sessionId)
})

// Register a new user
router.post('/register', async (req: Request<RegisterRequest>, res: Response<LoginResponse>) => {
  const member = PublicRegisterRequestSchema.parse(req.body)

  logger.info('registration request from %s', member.email)

  if (process.env.TURNSTILE_ENABLED === 'true' && !member.turnstileToken) {
    return problem({ status: 400, detail: 'Captcha verification is required' })
  }

  if (member.turnstileToken) {
    const isValid = await verifyTurnstileToken(member.turnstileToken, req.ip)
    if (!isValid) {
      logger.warn('Registration attempt with invalid Turnstile token from %s', member.email)
      return problem({ status: 400, detail: 'Invalid captcha verification' })
    }
  }

  if (await getMemberByEmail(member.email)) {
    return silentFailure(
      `An attempt was made to register user with already existing email ${member.email}`,
      res,
    )
  }

  const memberId = await addMember(member)
  logger.info('new member registered with id %s (email: %s)', memberId, member.email)

  // Use registration verification strategy instead of magic login
  const link = registrationVerification.generateVerificationLink(member.email)
  logger.info('registration verification link generated %j', link)

  const registrationMail = renderEmail('registration-submit', member.lang, {
    ...member,
    ...link,
  })
  sendEmail(member.email, registrationMail.subject, registrationMail.html)
  logger.info('registration verification email sent %j', link)

  return res.json({ code: link.code, memberId })
})

// Magic-link email click-through verification.
// The frontend POSTs the raw token from the URL query parameter.
// We hash it server-side and do an atomic DB lookup — the raw token is never stored.
router.post('/login/validate', async (req: Request, res: Response) => {
  const raw: unknown = req.body.token
  if (typeof raw !== 'string' || !raw) {
    return res.status(400).json({ error: 'Token is required' })
  }

  const tokenHash = createHash('sha256').update(raw).digest('hex')

  // Atomic claim: marks the row as used only if it exists, is unused, and has not expired.
  // Returns undefined on any failure, preventing replay attacks under concurrency.
  const attempt = await claimLoginAttemptByTokenHash(tokenHash)
  if (!attempt) {
    logger.warn('login/validate: invalid, already-used, or expired token from %s', req.ip)
    return res.status(401).json({ error: 'Invalid or expired link' })
  }

  const member = await getMemberByEmail(attempt.email)
  if (!member) {
    logger.warn('login/validate: no member found for email in attempt %s', attempt.id)
    return res.status(401).json({ error: 'Invalid or expired link' })
  }

  // Mark the email as verified on first magic-link login
  if (!member.emailVerifiedAt) {
    const jwtForUpdate = generateJWTUser(member)
    await updateMember(member.memberId, { emailVerifiedAt: new Date().toISOString() }, jwtForUpdate)
  }

  const jwtUser = generateJWTUser(member)
  await createLoginEvent(member.memberId, 'login_success', req.ip, req.headers['user-agent'])
  const sessionId = await createSession(member.memberId, req.ip, req.headers['user-agent'])
  respondWithAccessAndRefreshToken(jwtUser, res, sessionId)
})

// Registration verification endpoint
router.post('/register/verify', async (req: Request, res: Response) => {
  const token = req.body.token || req.query.token

  if (!token) {
    return res.status(400).json({ error: 'Token is required' })
  }

  try {
    // Verify the JWT token and extract payload
    const payload = jwt.verify(token, process.env.MAGIC_LINK_SECRET!) as any

    // Use registration verification strategy
    const user = await registrationVerification.verifyRegistration(payload)

    if (user) {
      await createLoginEvent(
        user.memberId,
        'registration_verified',
        req.ip,
        req.headers['user-agent'],
      )
      const sessionId = await createSession(user.memberId, req.ip, req.headers['user-agent'])
      respondWithAccessAndRefreshToken(user, res, sessionId)
    } else {
      res.status(401).json({ error: 'Registration verification failed' })
    }
  } catch (err) {
    logger.error('Registration verification error:', err)
    res.status(401).json({ error: 'Invalid or expired verification token' })
  }
})

/**
 * Exchange a refresh token for a fresh pair.
 *
 * This is also the *only* place session revocation is enforced (#1234). Checking
 * it here rather than in authMiddleware is what keeps the per-request hot path
 * free of database lookups, and is why revocation is bounded rather than
 * instant: a terminated session's existing access token keeps working until it
 * expires, up to 15 minutes. The sessions card says so in as many words.
 */
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  const refreshToken = readRefreshToken(req)
  if (!refreshToken) {
    return problem({ status: 401, detail: 'Refresh token not found' })
  }

  // A refresh token this deployment cannot verify is an expired or foreign
  // session, not a server fault: answer 401 so the client redirects to the
  // login screen instead of surfacing a 500 from the error handler.
  let payload: DecodedRefreshToken
  try {
    payload = decodeRefreshToken(refreshToken)
  } catch {
    clearAuthCookies(res)
    return problem({ status: 401, detail: 'Refresh token is not valid' })
  }

  const user = await getMemberById(payload.memberId)
  if (!user) {
    return next(new Error('User not found'))
  }

  // Reuse the session rather than opening a new one. A browser refreshes roughly
  // every 15 minutes while someone is using the app, so a row per refresh would
  // bury the one session they actually care about under a day's worth of
  // duplicates and make "log out of all other sessions" meaningless.
  let sessionId = payload.jti
  if (sessionId) {
    if (!(await touchSession(sessionId))) {
      // The row is revoked or gone. This is the revocation taking effect: refuse
      // and clear the cookies rather than quietly minting a replacement session,
      // which would undo the terminate the member just performed elsewhere.
      logger.info('refresh refused for revoked session %s (member %s)', sessionId, user.memberId)
      clearAuthCookies(res)
      return problem({ status: 401, detail: 'Session has been terminated' })
    }
  } else {
    // A refresh token minted before #1234 shipped carries no jti and so has no
    // row to touch. Adopting it into a new session is deliberate: treating it as
    // revoked would sign every member out at deploy time, and the token is a
    // validly signed one from this deployment — it is old, not forged. Every
    // such token is rotated into a session-bearing one by this very response,
    // so the case disappears on its own within one refresh interval.
    sessionId = await createSession(user.memberId, req.ip, req.headers['user-agent'])
    logger.info('adopted a pre-session refresh token into session %s', sessionId)
  }

  const jwtUser = generateJWTUser(user)
  await createLoginEvent(user.memberId, 'token_refresh', req.ip, req.headers['user-agent'])
  respondWithAccessAndRefreshToken(jwtUser, res, sessionId)
})

router.post('/logout', async (req: Request, res: Response) => {
  // End the session registry row too, so the device disappears from the member's
  // sessions list instead of lingering as an active session nobody is using
  // (#1234).
  //
  // The session id comes from the *access* cookie, not the refresh one: the
  // refresh cookie is scoped to path '/api/auth/refresh' and is therefore never
  // sent here. Everything in this block is best-effort — a logout must clear
  // cookies and return 200 even when the token is missing, expired or garbage,
  // because the alternative is a member who cannot sign out.
  const accessToken = readAccessToken(req)
  if (accessToken) {
    try {
      const payload = decodeAccessTokenIgnoringExpiry(accessToken)
      if (payload.sid) {
        await revokeSession(payload.sid, 'logout')
      }
      // 'logout' has been in the auth_event_type enum since the beginning and
      // has never once been written. Closing that gap here.
      await createLoginEvent(payload.memberId, 'logout', req.ip, req.headers['user-agent'])
    } catch {
      logger.warn('logout with an unreadable access token; clearing cookies anyway')
    }
  }

  // Clears every name and scope this backend has ever set an auth cookie under
  // — see ./cookies.ts. Clearing only the host-only variant left the shared
  // '.mik.fi' session alive, so logging out of either app logged you out of
  // neither; leaving the legacy unprefixed names behind would strand cookies
  // the browser keeps sending forever.
  clearAuthCookies(res)
  res.status(200).json({})
})

// Public endpoint — no auth required — returns joining fee prices from the database.
router.get('/joining-fees', async (_req: Request, res: Response) => {
  const fees = await getArticleFees([
    ART_JOINING_FEE,
    ART_JUNIOR_JOINING_FEE,
    ART_SUPPORTING_MEMBER_JOINING_FEE,
    ART_MEMBER_FEE_CODE,
    ART_JUNIOR_MEMBER_FEE_CODE,
    ART_SUPPORTING_MEMBER_FEE_CODE,
  ])

  const fullMemberFeeArticle = fees.find((f) => f.code === ART_JOINING_FEE)
  // Junior and supporting members share the same joining-fee tier; prefer junior code
  // (NLIITTYMINEN) and fall back to supporting-member code (KLIITTYMINEN) if absent.
  const reducedMemberFeeArticle =
    fees.find((f) => f.code === ART_JUNIOR_JOINING_FEE) ??
    fees.find((f) => f.code === ART_SUPPORTING_MEMBER_JOINING_FEE)

  const fullMemberFee = fullMemberFeeArticle ? resolveArticlePrice(fullMemberFeeArticle) : null
  const reducedMemberFee = reducedMemberFeeArticle
    ? resolveArticlePrice(reducedMemberFeeArticle)
    : null
  const fullMemberAnnualFeeArticle = fees.find((f) => f.code === ART_MEMBER_FEE_CODE)
  const juniorMemberAnnualFeeArticle = fees.find((f) => f.code === ART_JUNIOR_MEMBER_FEE_CODE)
  const supportingMemberAnnualFeeArticle = fees.find(
    (f) => f.code === ART_SUPPORTING_MEMBER_FEE_CODE,
  )

  // New members who join from October onward only cover the rest of the calendar
  // year, so the annual fee (not the joining fee) gets the same half-year discount
  // as createNewMemberFeesInvoicePayload applies at approval time — see
  // apps/backend/src/services/accounting/recurringFeesInvoiceCreator.ts. Showing
  // the discounted number here keeps the applicant's fee acknowledgement accurate
  // instead of quoting a price they won't actually be invoiced.
  const membershipFeeDiscountApplied = isAfterMembershipFeeDiscountDate()
  const applyMembershipFeeDiscount = (fee: number | null) =>
    fee === null || !membershipFeeDiscountApplied
      ? fee
      : Math.round(fee * (1 - HALF_YEAR_DISCOUNT_PERCENT / 100) * 100) / 100

  const fullMemberAnnualFee = applyMembershipFeeDiscount(
    fullMemberAnnualFeeArticle ? resolveArticlePrice(fullMemberAnnualFeeArticle) : null,
  )
  const juniorMemberAnnualFee = applyMembershipFeeDiscount(
    juniorMemberAnnualFeeArticle ? resolveArticlePrice(juniorMemberAnnualFeeArticle) : null,
  )
  const supportingMemberAnnualFee = applyMembershipFeeDiscount(
    supportingMemberAnnualFeeArticle ? resolveArticlePrice(supportingMemberAnnualFeeArticle) : null,
  )

  res.status(200).json({
    fullMemberFee,
    reducedMemberFee,
    fullMemberAnnualFee,
    juniorMemberAnnualFee,
    supportingMemberAnnualFee,
    membershipFeeDiscountApplied,
  })
})
