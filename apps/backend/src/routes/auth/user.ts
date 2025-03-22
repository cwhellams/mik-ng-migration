import { z } from 'zod'

import { MIKRoles, type Member } from '../members/models.ts'

// should match User in types/express.d.ts
export const JWTPayloadSchema = z.object({
  userId: z.number(),
  email: z.string(),
  roles: z.array(z.nativeEnum(MIKRoles)),
})

export type JWTPayload = z.infer<typeof JWTPayloadSchema>

export const generateJWTPayload = (user: Member): JWTPayload => ({
  userId: user.memberId,
  email: user.email,
  roles: user.roles,
})
