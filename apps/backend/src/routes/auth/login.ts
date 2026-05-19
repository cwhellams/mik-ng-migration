import { Router, type Request, type Response, type NextFunction } from 'express'
import { createHash } from 'node:crypto'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { RateLimiterMemory } from 'rate-limiter-flexible'
import dayjs from 'dayjs'

import { buildMagicLinkHref, generateMagicLinkToken, generateLoginCode } from './magiclink.ts'
import { MIKRegistrationVerificationStrategy } from './registration-verification.ts'
import {
  LoginRequestSchema,
  RegisterRequestSchema,
  VerifyCodeRequestSchema,
  type LoginRequest,
  type LoginResponse,
  type RegisterRequest,
} from './schema.ts'
import { decodeRefreshToken, respondWithAccessAndRefreshToken } from './token.ts'
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
import { getArticleFees } from '../../db/invoicing-queries.ts'
import {
  ART_JOINING_FEE,
  ART_JUNIOR_JOINING_FEE,
  ART_SUPPORTING_MEMBER_JOINING_FEE,
} from '../../services/accounting/config.ts'
import logger from '../../lib/logger.ts'
import { sendEmail } from '../../lib/sendGmail.ts'
import { loginEmailTitle, loginEmailBodyHtml } from '../../templates/loginEmailTemplate.ts'
import { getRandomInt } from '../../util/math-utils.ts'
import { problem } from '../response.ts'
import {
  registerEmailBodyHtml,
  registerEmailTitle,
} from '../../templates/registrationEmailTemplate.ts'
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
  const href = buildMagicLinkHref(linkToken, target)

  // Invalidate any previous pending attempts and store the new hashed code in the DB.
  // The raw code is never persisted; only a bcrypt hash is stored.
  await invalidatePreviousLoginAttempts(member.email)
  const codeHash = await bcrypt.hash(code.toString(), 10)
  const expiresAt = dayjs().add(15, 'minutes').toDate()
  await createLoginAttempt(member.email, codeHash, linkTokenHash, expiresAt, req.ip)

  sendEmail(
    member.email,
    loginEmailTitle(member.lang),
    loginEmailBodyHtml(member.lang, { href, code, firstName: member.firstName }),
  )
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

  const codeMatches = bcrypt.compareSync(code, attempt.code_hash)
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
  respondWithAccessAndRefreshToken(jwtUser, res)
})

// Register a new user
router.post('/register', async (req: Request<RegisterRequest>, res: Response<LoginResponse>) => {
  const member = RegisterRequestSchema.parse(req.body)

  logger.info('registration request from %s', member.email)

  // Verify Turnstile token if provided
  if (member.turnstileToken) {
    const isValid = await verifyTurnstileToken(member.turnstileToken, req.ip)
    if (!isValid) {
      logger.warn('Registration attempt with invalid Turnstile token from %s', member.email)
      return res.status(400).json({ error: 'Invalid captcha verification' })
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

  sendEmail(
    member.email,
    registerEmailTitle(member.lang),
    registerEmailBodyHtml(member.lang, { ...member, ...link }),
  )
  logger.info('registration verification email sent %j', link)

  return res.json({ code: link.code })
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
  respondWithAccessAndRefreshToken(jwtUser, res)
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
      respondWithAccessAndRefreshToken(user, res)
    } else {
      res.status(401).json({ error: 'Registration verification failed' })
    }
  } catch (err) {
    logger.error('Registration verification error:', err)
    res.status(401).json({ error: 'Invalid or expired verification token' })
  }
})

router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  const refreshToken = req.cookies?.refreshToken
  if (!refreshToken) {
    return problem({ status: 401, detail: 'Refresh token not found' })
  }

  const payload = decodeRefreshToken(refreshToken)
  const user = await getMemberById(payload.memberId)
  if (user) {
    const jwtUser = generateJWTUser(user)
    await createLoginEvent(user.memberId, 'token_refresh', req.ip, req.headers['user-agent'])
    respondWithAccessAndRefreshToken(jwtUser, res)
  } else {
    next(new Error('User not found'))
  }
})

router.post('/logout', async (req: Request, res: Response) => {
  const secure = process.env.NODE_ENV === 'production'
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/api/auth/refresh',
  })
  res.clearCookie('accessToken', {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/',
  })
  res.status(200).json({})
})

// Public endpoint — no auth required — returns joining fee prices from the database.
router.get('/joining-fees', async (_req: Request, res: Response) => {
  const fees = await getArticleFees([
    ART_JOINING_FEE,
    ART_JUNIOR_JOINING_FEE,
    ART_SUPPORTING_MEMBER_JOINING_FEE,
  ])

  const fullMemberFee = fees.find(f => f.code === ART_JOINING_FEE)?.price_per_unit ?? null
  // Junior and supporting members share the same joining-fee tier; prefer junior code
  // (NLIITTYMINEN) and fall back to supporting-member code (KLIITTYMINEN) if absent.
  const reducedMemberFee =
    fees.find(f => f.code === ART_JUNIOR_JOINING_FEE)?.price_per_unit ??
    fees.find(f => f.code === ART_SUPPORTING_MEMBER_JOINING_FEE)?.price_per_unit ??
    null

  res.status(200).json({ fullMemberFee, reducedMemberFee })
})
