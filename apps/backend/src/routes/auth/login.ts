import { Router, type Request, type Response, type NextFunction } from 'express'
import passport from 'passport'

import { MIKMagicLoginStrategy } from './magiclink.ts'
import {
  LoginRequestSchema,
  RegisterRequestSchema,
  type LoginRequest,
  type LoginResponse,
  type RegisterRequest,
  type VerifyResponse,
} from './schema.ts'
import { decodeRefreshToken, generateAccessToken, generateRefreshToken } from './token.ts'
import { generateJWTUser, type JWTUser } from './token.ts'
import { addMember, getMemberByEmail, getMemberById } from '../../db/queries.ts'
import logger from '../../lib/logger.ts'
import { sendEmail } from '../../lib/sendGmail.ts'
import {
  loginEmailTitle,
  loginEmailBody,
  registerEmailBody,
  registerEmailTitle,
} from '../../templates/email.ts'
import { getRandomInt } from '../../util/math-utils.ts'

const magicLogin = new MIKMagicLoginStrategy()
passport.use(magicLogin)

//
// Routing methods from UI
//
export const router = Router()

const silentFailure = (message: string, res: Response<LoginResponse>): void => {
  logger.warn(message)
  res.status(200).json({ code: getRandomInt(10000, 99999) })
}

// Login existing user
router.post('/login', async (req: Request<LoginRequest>, res: Response<LoginResponse>) => {
  const { email, target, lang } = LoginRequestSchema.parse(req.body)

  // Check that we have a memeber with this email address, to avoid sending magic link to non-existing user.
  // Do not leak information about existing users, if nothing found still return 200 with a random verification code and log a warning.
  const member = await getMemberByEmail(email)
  if (!member) {
    return silentFailure(
      `An attempt was made to login with email ${email}. No matching member found in database`,
      res,
    )
  }

  const link = magicLogin.generateLink(member.email, target)
  sendEmail(member.email, loginEmailTitle(lang), await loginEmailBody(lang, link))
  logger.info('magic login link sent for validation %j', link)

  return res.json({ code: link.code })
})

// Register a new user
router.post('/register', async (req: Request<RegisterRequest>, res: Response<LoginResponse>) => {
  const member = RegisterRequestSchema.parse(req.body)

  logger.info('registration request', member)

  if (await getMemberByEmail(member.email)) {
    return silentFailure(
      `An attempt was made to register user with already existing email ${member.email}`,
      res,
    )
  }

  const memberId = await addMember(member)
  logger.info('new member registered with id %s : %j', memberId, member)

  const link = magicLogin.generateLink(member.email)
  logger.info('registration sent for validation %j', link)

  sendEmail(
    member.email,
    registerEmailTitle(member.lang),
    registerEmailBody(member.lang, { ...member, ...link }),
  )
  logger.info('magic registration link sent for validation %j', link)

  return res.json({ code: link.code })
})

const respondWithAccessAndRefreshToken = (user: JWTUser, res: Response<VerifyResponse>): void => {
  // Refresh token is stored in a secure cookie not accessible by frontend
  res.cookie('refreshToken', generateRefreshToken(user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',

    // cookie is only sent to refresh endpoint
    path: '/auth/refresh',
  })

  // Access token is used to verify requests and is valid only for a short time.
  // It's stored in the local storage.
  res.status(200).json({ accessToken: generateAccessToken(user) })
}

router.post(
  '/login/validate',

  // Login with magic link
  passport.authenticate('magiclogin', { session: false }),

  (req: Request, res: Response<VerifyResponse>) => {
    // validation was successful, return access token back to the UI
    respondWithAccessAndRefreshToken(req.user!, res)
  },
)

router.post('/refresh', async (req: Request, res: Response<VerifyResponse>, next: NextFunction) => {
  const refreshToken = req.cookies?.refreshToken
  if (!refreshToken) {
    return res.status(401).send({ error: 'Refresh token not found' })
  }

  const payload = decodeRefreshToken(refreshToken)
  const user = await getMemberById(payload.memberId)
  if (user) {
    const jwt = generateJWTUser(user)
    respondWithAccessAndRefreshToken(jwt, res)
  } else {
    next(new Error('User not found'))
  }
})

router.post('/logout', async (req: Request, res: Response<VerifyResponse>) => {
  res.clearCookie('refreshToken')
  res.status(200).json({})
})
