import { z } from 'zod'

import { MIKRoles } from '../auth/user.ts'
import e from 'cors'

// member list endpoint

const MemberListSchema = z.object({
  name: z.string(),
  memberId: z.number(),
  phoneNumber: z.string().nullish(),
})

export type MemberList = z.infer<typeof MemberListSchema>

export const MemberListResponseSchema = z.object({
  members: z.array(MemberListSchema),
})

export type MemberListResponse = z.infer<typeof MemberListResponseSchema>

// me-endpoint

export const MemberSchema = z.object({
  memberId: z.number(),
  memberType: z.string(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  iceContactName: z.string().nullish(),
  iceContactPhoneNumber: z.string().nullish(),
  isTrainingProgramPilot: z.boolean(),
  phoneNumber: z.string().nullish(),
  postcode: z.string().nullish(),
  streetAddress: z.string().nullish(),
  townCity: z.string().nullish(),
  roles: z.array(z.nativeEnum(MIKRoles)),
})

export type Member = z.infer<typeof MemberSchema>

export type MemberResponse = z.infer<typeof MemberSchema>
