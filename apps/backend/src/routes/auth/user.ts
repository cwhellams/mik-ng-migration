import { z } from 'zod'
import { MemberRegister } from '../../db/schema'
import { Selectable } from 'kysely'

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
