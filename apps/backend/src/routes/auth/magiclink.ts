import MagicLoginStrategy from 'passport-magic-login'

import { generateToken } from './token.ts'
import { generateJWTPayload } from './user.ts'
import { getMember, updateMember } from '../../db/queries.ts'
import logger from '../../lib/logger.ts'
import { getRandomInt } from '../../util/math-utils.ts'

if (!process.env.MAGIC_LINK_SECRET) {
  throw new Error('MAGIC_LINK_SECRET is not defined in environment variables')
}

// The authentication callback URL
const callbackUrl = `${process.env.PUBLIC_URL}/login/validate`

// Extend the Magic Login Strategy so that we can use
// the generated link in both login and registration flows
// and send different email
export class MIKMagicLoginStrategy extends MagicLoginStrategy.default {
  constructor() {
    super({
      // Used to encrypt the temporary token
      secret: process.env.MAGIC_LINK_SECRET!,

      callbackUrl,

      // Once the user clicks on the magic link and verifies their login attempt,
      // you have to match their email to a user record in the database.
      verify: async (payload: { email: string }, callback): Promise<void> => {
        // Get or create a user with the provided email from the database
        logger.info('magic login verify %j', payload)

        try {
          const user = await getMember(payload.email)
          if (user) {
            const jwt = generateJWTPayload(user)

            if (!user.emailVerifiedAt) {
              // store the date when the email was first verified
              await updateMember(user, { emailVerifiedAt: new Date().toISOString() }, jwt)
            }

            callback(null, jwt)
          } else {
            callback(new Error('User not found'))
          }
        } catch (err) {
          callback(err as Error)
        }
      },

      // use generateLink extension instead
      sendMagicLink: async () => {},
    })
  }

  generateLink(email: string, target?: string): { href: string; code: number } {
    const code = getRandomInt(10000, 99999)

    const jwt = generateToken(
      process.env.MAGIC_LINK_SECRET!,
      {
        email,
        code: code.toString(),
      },
      {
        // Optional: options passed to the jwt.sign call (https://github.com/auth0/node-jsonwebtoken#jwtsignpayload-secretorprivatekey-options-callback)
        expiresIn: '15 minutes',
      },
    )
    return {
      href: `${callbackUrl}?token=${jwt}${target ? `&target=${target}` : ''}`,
      code,
    }
  }
}
