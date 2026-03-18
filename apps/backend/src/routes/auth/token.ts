import jwt, { type SignOptions } from 'jsonwebtoken'
import type ms from 'ms'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'

import { MIKPermissions, type Member } from '../members/models.ts'
import { problem } from '../response.ts'

export const MIK_ISS = 'mik'
export const API_AUD = 'api'
export const REFRESH_AUD = 'refresh'

// should match User in types/express.d.ts
export const JWTUserSchema = z.object({
  memberId: z.string(),
  lastName: z.string(),
  email: z.string(),
  roles: z.array(z.string()),
  permissions: z.array(z.nativeEnum(MIKPermissions)),
  canMakeReservations: z.boolean(),
})

export type JWTUser = z.infer<typeof JWTUserSchema>

export const generateJWTUser = (user: Member): JWTUser => ({
  memberId: user.memberId,
  lastName: user.lastName,
  email: user.email,
  roles: user.roles.map(r => r.roleId),
  permissions: user.roles.reduce(
    (all, role) => (role.permissions ? [...all, ...role.permissions] : all),
    [] as MIKPermissions[],
  ),
  canMakeReservations: user.canMakeReservations,
})

export const generateToken = (
  payload: object,
  secret: string | undefined,
  options: SignOptions,
): string => {
  return jwt.sign(payload, secret ?? problem({ status: 500, detail: 'No secret' }), options)
}

export const generateAccessToken = (user: JWTUser): string => {
  return generateToken(user, process.env.ACCESS_TOKEN_SECRET, {
    jwtid: randomUUID(),
    expiresIn: process.env.ACCESS_TOKEN_EXPIRATION as ms.StringValue,
    issuer: MIK_ISS,
    audience: API_AUD,
  })
}

export const generateRefreshToken = (user: JWTUser): string =>
  generateToken(user, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRATION as ms.StringValue,
    issuer: MIK_ISS,
    audience: REFRESH_AUD,
  })

export const decodeRefreshToken = (refreshToken: string): JWTUser =>
  jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET!, {
    issuer: MIK_ISS,
    audience: REFRESH_AUD,
  }) as JWTUser
