import { generateJWTUser, generateToken } from './token.ts'
import { getMemberByEmail, updateMember } from '../../db/member-queries.ts'
import logger from '../../lib/logger.ts'
import { getRandomInt } from '../../util/math-utils.ts'

if (!process.env.MAGIC_LINK_SECRET) {
  throw new Error('MAGIC_LINK_SECRET is not defined in environment variables')
}

// The registration verification callback URL
const registrationCallbackUrl = `${process.env.PUBLIC_URL}/register/verify`

// Registration verification strategy with longer expiry time
export class MIKRegistrationVerificationStrategy {
  generateVerificationLink(email: string): { href: string; code: number } {
    const code = getRandomInt(10000, 99999)

    const jwt = generateToken(
      {
        email,
        code: code.toString(),
        type: 'registration', // Add type to distinguish from login tokens
      },
      process.env.MAGIC_LINK_SECRET,
      {
        expiresIn: '3 days', // Extended expiry time as requested
      },
    )
    return {
      href: `${registrationCallbackUrl}?token=${jwt}`,
      code,
    }
  }

  async verifyRegistration(payload: { email: string; type?: string }): Promise<any> {
    logger.info('registration verification %j', payload)

    // Only process registration verification tokens
    if (payload.type !== 'registration') {
      throw new Error('Invalid token type for registration verification')
    }

    try {
      const user = await getMemberByEmail(payload.email)
      if (user) {
        const jwt = generateJWTUser(user)

        if (!user.emailVerifiedAt) {
          // Store the date when the email was first verified
          await updateMember(user.memberId, { emailVerifiedAt: new Date().toISOString() }, jwt)
        }

        return jwt
      } else {
        throw new Error('User not found')
      }
    } catch (err) {
      throw err
    }
  }
}
