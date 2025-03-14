import crypto from 'crypto'

import jwt, { SignOptions } from 'jsonwebtoken'
import { Selectable } from 'kysely'
import ms from 'ms'
import { z } from 'zod'

//import bcrypt from 'bcryptjs'
import { MemberRegister } from '../../db/schema'

export enum MIKRoles {
  USER = 'USER',
  ADMIN = 'ADMIN',
  INSTRUCTOR = 'INSTRUCTOR',
  COMMITTEE = 'COMMITTEE',
}

export const JWTPayloadSchema = z.object({
  sessionId: z.string(),
  userId: z.number(),
  email: z.string(),
  roles: z.array(z.nativeEnum(MIKRoles)),
})

export type JWTPayload = z.infer<typeof JWTPayloadSchema>

export const generateJWTPayload = (
  user: Selectable<MemberRegister>,
  roles: MIKRoles[],
): JWTPayload => ({
  sessionId: crypto.randomUUID(),
  userId: user.member_id,
  email: user.email,
  roles: roles,
})

// Ensure token expiration is valid
const generateOptions = (expiresIn: string): SignOptions => {
  return {
    algorithm: 'HS256',
    expiresIn: expiresIn as ms.StringValue,
  }
}

// Function to generate access token
const generateAccessToken = (payload: JWTPayload): string => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not defined in environment variables')
  }

  try {
    return jwt.sign(
      payload,
      process.env.JWT_SECRET,
      generateOptions(process.env.ACCESS_TOKEN_EXPIRATION || '15m'),
    )
  } catch (error) {
    console.error('Error generating access token:', error)
    throw new Error('Failed to generate access token')
  }
}

const generateRefreshToken = async (payload: JWTPayload): Promise<string> => {
  if (!process.env.JWT_REFRESH_SECRET) {
    throw new Error('JWT_REFRESH_SECRET is not defined in environment variables')
  }

  try {
    const refreshToken = jwt.sign(
      payload,
      process.env.JWT_REFRESH_SECRET,
      generateOptions(process.env.REFRESH_TOKEN_EXPIRATION || '7d'),
    )
    //const hashedToken = await bcrypt.hash(refreshToken, 10)

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
