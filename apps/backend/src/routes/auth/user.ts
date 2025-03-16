import type { Selectable } from 'kysely'
import { z } from 'zod'

import type { MemberRegister } from '../../db/schema.d.ts'

export enum MIKRoles {
  USER = 'USER',
  ADMIN = 'ADMIN',
  INSTRUCTOR = 'INSTRUCTOR',
  COMMITTEE = 'COMMITTEE',
}

// should match User in types/express.d.ts
export const JWTPayloadSchema = z.object({
  userId: z.number(),
  email: z.string(),
  roles: z.array(z.nativeEnum(MIKRoles)),
})

export type JWTPayload = z.infer<typeof JWTPayloadSchema>

export const generateJWTPayload = (
  user: Selectable<MemberRegister>,
  roles: MIKRoles[],
): JWTPayload => ({
  userId: user.member_id,
  email: user.email,
  roles: roles,
})
