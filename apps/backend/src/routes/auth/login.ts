import type { Request, Response, NextFunction } from 'express'
import { Router } from 'express'
import jwt from 'jsonwebtoken'
import type { Secret } from 'jsonwebtoken'
import ms from 'ms'
import passport from 'passport'
import MagicLoginStrategy from 'passport-magic-login'

import { generateJWTPayload } from './user.ts'
import { getMember, getMemberRoles } from '../../db/queries.ts'
import logger from '../../lib/logger.ts'
import { sendEmail } from '../../lib/sendGmail.ts'
import { getRandomInt } from '../../util/math-utils.ts'

if (!process.env.MAGIC_LINK_SECRET) {
  throw new Error('MAGIC_LINK_SECRET is not defined in environment variables')
}
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is not defined in environment variables')
}

//
// Passport strategy
//
// https://github.com/mxstbr/passport-magic-login/issues/7
const magicLogin = new MagicLoginStrategy.default({
  // Used to encrypt the temporary token
  secret: process.env.MAGIC_LINK_SECRET,

  // The authentication callback URL
  callbackUrl: `${process.env.PUBLIC_URL}/login/validate`,

  // Called with the generated magic link so you can send it to the user
  sendMagicLink: async (destination, href, verificationCode): Promise<void> => {
    logger.info('magic login sendMagicLink for validation %s : %s', verificationCode, href)

    sendEmail(
      destination,
      'Your login to MIK',
      '',
      `
      <p>You are logging in to MIK with verification code ${verificationCode}.</p>

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
  },

  // Once the user clicks on the magic link and verifies their login attempt,
  // you have to match their email to a user record in the database.
  verify: async (payload: { destination: string }, callback): Promise<void> => {
    // Get or create a user with the provided email from the database
    logger.info('magic login verify %s', payload)

    try {
      const user = await getMember(payload.destination)
      const roles = user ? await getMemberRoles(user.member_id) : []

      if (user) {
        const payload = generateJWTPayload(user, roles)
        callback(null, payload)
      } else {
        callback(new Error('User not found'))
      }
    } catch (err) {
      callback(err as Error)
    }
  },

  // Optional: options passed to the jwt.sign call (https://github.com/auth0/node-jsonwebtoken#jwtsignpayload-secretorprivatekey-options-callback)
  jwtOptions: {
    expiresIn: '15 minutes',
  },
})

passport.use(magicLogin)

//
// Routing methods from UI
//
export const router = Router()

// This is where we POST to from the frontend
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  const { destination } = req.body

  if (!destination) {
    return res.status(400).json({ error: 'An Email address is required' })
  }

  try {
    // Check that we have a memeber with this email address, to avoid sending magic link to non-existing user.
    // Do not leak information about existing users, if nothing found still return 200 with a random verification code and log a warning.
    const user = await getMember(destination)
    if (!user) {
      logger.warn(
        `An attempt was made to login with email ${destination}. No matching member found in database`,
      )
      return res.status(200).json({ code: getRandomInt(10000, 99999) })
    }

    magicLogin.send(req, res)
    next()
  } catch (err) {
    logger.error('Error checking user in database', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// Login with magic link and return jwt token back to the UI
router.post(
  '/login/validate',
  passport.authenticate('magiclogin', { session: false }),
  (req: Request, res: Response, next: NextFunction) => {
    const accessToken = jwt.sign(req.user ?? {}, process.env.JWT_SECRET as Secret, {
      algorithm: 'HS256',
      expiresIn: process.env.JWT_EXPIRATION as ms.StringValue,
    })
    res.status(200).json({ user: req.user, accessToken })
    next()
  },
)
