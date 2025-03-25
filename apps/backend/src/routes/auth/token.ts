import jwt, { type SignOptions } from 'jsonwebtoken'
import type ms from 'ms'
import { z } from 'zod'

import { MIKRoles, type Member } from '../members/models.ts'
import { throwError } from '../response.ts'

// should match User in types/express.d.ts
export const JWTPayloadSchema = z.object({
  memberId: z.number(),
  email: z.string(),
  roles: z.array(z.nativeEnum(MIKRoles)),
})

export type JWTPayload = z.infer<typeof JWTPayloadSchema>

export const generateJWTPayload = (user: Member): JWTPayload => ({
  memberId: user.memberId,
  email: user.email,
  roles: user.roles,
})

export const generateToken = (
  payload: object,
  secret: string | undefined,
  options: SignOptions,
): string => {
  return jwt.sign(payload, secret ?? throwError('No secret'), options)
}

export const generateAccessToken = (user: JWTPayload): string => {
  return generateToken(user, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: process.env.ACCESS_TOKEN_EXPIRATION as ms.StringValue,
    issuer: 'mik',
    audience: 'api',
  })
}

export const generateRefreshToken = (user: JWTPayload): string =>
  generateToken(user, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRATION as ms.StringValue,
    issuer: 'mik',
    audience: 'refresh',
  })

export const decodeRefreshToken = (refreshToken: string): JWTPayload =>
  jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET!, {
    issuer: 'mik',
    audience: 'refresh',
  }) as JWTPayload
