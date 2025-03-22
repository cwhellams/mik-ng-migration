import { Router, type Request, type Response, type NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import type { Secret } from 'jsonwebtoken'
import ms from 'ms'
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
import { addMember, getMember } from '../../db/queries.ts'
import logger from '../../lib/logger.ts'
import { sendEmail } from '../../lib/sendGmail.ts'
import { getRandomInt } from '../../util/math-utils.ts'

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is not defined in environment variables')
}

const magicLogin = new MIKMagicLoginStrategy()
passport.use(magicLogin)

//
// Routing methods from UI
//
export const router = Router()

const silentFailure = (message: string, res: Response<LoginResponse>) => {
  logger.warn(message)
  res.status(200).json({ code: getRandomInt(10000, 99999) })
}

// Login existing user
router.post('/login', async (req: Request<LoginRequest>, res: Response<LoginResponse>) => {
  const { email } = LoginRequestSchema.parse(req.body)

  // Check that we have a memeber with this email address, to avoid sending magic link to non-existing user.
  // Do not leak information about existing users, if nothing found still return 200 with a random verification code and log a warning.
  const member = await getMember(email)
  if (!member) {
    return silentFailure(
      `An attempt was made to login with email ${email}. No matching member found in database`,
      res,
    )
  }

  const { href, code } = magicLogin.generateLink(member.email)
  sendEmail(
    member.email,
    'Your login to MIK',
    '',
    `
      <p>You are logging in to MIK with verification code ${code}.</p>
      
      <p>Click the link below:
      <br/>
      <b><a href="${href}">Confirm login</a>
      </p></b>
      
      <p>Alternatively you can also copy and paste the link into your browser:
      <br/>
      ${href}
      </p>
      `,
  )
  logger.info('magic login link sent for validation %s : %s', code, href)

  return res.json({ code })
})

// Register a new user
router.post('/register', async (req: Request<RegisterRequest>, res: Response<LoginResponse>) => {
  const member = RegisterRequestSchema.parse(req.body)

  logger.info('registration request', member)

  if (await getMember(member.email)) {
    return silentFailure(
      `An attempt was made to register user with already existing email ${member.email}`,
      res,
    )
  }

  const memberId = await addMember(member)
  logger.info('new member registered with id %s : %j', memberId, member)

  const { href, code } = magicLogin.generateLink(member.email)
  logger.info('registration sent for validation %s : %s', code, href)
  sendEmail(
    member.email,
    'Welcome to MIK',
    '',
    `
      <p>Hello ${member.firstName}, thank you for joining MIK.</p>

      <p>Click the link below to confirm your email address and log in
      <br/>
      <a href="${href}">Continue login</a>
      </p>

      <p>Alternatively you can also copy and paste the link into your browser:
      <br/>
      ${href}
      </p>
      `,
  )
  logger.info('magic registration link sent for validation %s : %s', code, href)

  return res.json({ code })
})

router.post(
  '/login/validate',

  // Login with magic link
  passport.authenticate('magiclogin', { session: false }),

  // validation was successful, return access token back to the UI
  (req: Request, res: Response<VerifyResponse>, next: NextFunction) => {
    const accessToken = jwt.sign(req.user ?? {}, process.env.JWT_SECRET as Secret, {
      algorithm: 'HS256',
      expiresIn: process.env.JWT_EXPIRATION as ms.StringValue,
    })
    res.status(200).json({ accessToken })
    next()
  },
)
