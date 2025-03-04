import jwt, { SignOptions } from 'jsonwebtoken'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import ms from 'ms'
import { User } from '../types/common'

// Function to generate access token
const generateAccessToken = (user: User, sessionId?: string): string => {
  const JWT_SECRET = process.env.JWT_SECRET as string
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not defined in environment variables')
  }

  // Validate and ensure expiresIn is of the correct type
  const expirationSchema = z.string().default('15m')
  const expiresIn: string | number = expirationSchema.parse(
    process.env.ACCESS_TOKEN_EXPIRATION
  )

  try {
    const payload: Record<string, any> = {
      userId: user.id,
      email: user.email,
    }

    if (sessionId) {
      payload.sessionId = sessionId // Only include if defined
    }

    const signOptions: SignOptions = {
      algorithm: 'HS256',
      expiresIn: expiresIn as jwt.SignOptions['expiresIn'],
    }

    return jwt.sign(payload, JWT_SECRET, signOptions)
  } catch (error) {
    console.error('Error generating access token:', error)
    throw new Error('Failed to generate access token')
  }
}

const generateRefreshToken = async (
  user: User,
  sessionId: string
): Promise<string> => {
  const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET as string
  if (!JWT_REFRESH_SECRET) {
    throw new Error(
      'JWT_REFRESH_SECRET is not defined in environment variables'
    )
  }

  // Ensure refresh token expiration is valid
  const expiresInEnv = process.env.REFRESH_TOKEN_EXPIRATION || '7d'
  const expiresInMs = ms(expiresInEnv as ms.StringValue)
  if (!expiresInMs) {
    throw new Error(`Invalid REFRESH_TOKEN_EXPIRATION format: ${expiresInEnv}`)
  }

  try {
    const payload = { userId: user.id, sessionId }
    const signOptions: SignOptions = {
      algorithm: 'HS256',
      expiresIn: expiresInEnv as jwt.SignOptions['expiresIn'],
    }

    const refreshToken = jwt.sign(payload, JWT_REFRESH_SECRET, signOptions)
    const hashedToken = await bcrypt.hash(refreshToken, 10)

    // TODO: Implement token storage
    // Example:
    /*
        const tokenEntry = new Token({
            userId: user._id || user.id,
            token: hashedToken,
            sessionId,
            deviceInfo: deviceInfo,
            ipAddress,
            expiresAt: new Date(Date.now() + expiresInMs),
        });

        await tokenEntry.save();
        */

    return refreshToken
  } catch (error) {
    console.error('Error generating refresh token:', error)
    throw new Error('Failed to generate refresh token')
  }
}

export { generateAccessToken, generateRefreshToken }
