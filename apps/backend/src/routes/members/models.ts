import { z } from 'zod'

export enum MIKRoles {
  USER = 'USER',
  ADMIN = 'ADMIN',
  INSTRUCTOR = 'INSTRUCTOR',
  COMMITTEE = 'COMMITTEE',
}

export enum MIKMemberTypes {
  FLYING = 'FLYING',
  NONFLYING = 'NONFLYING',
  JUNIOR = 'JUNIOR',
}

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

// member details endpoint

export const MemberSchema = z.object({
  memberId: z.number(),
  memberType: z.nativeEnum(MIKMemberTypes),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),

  phoneNumber: z.string().nullish(),
  streetAddress: z.string().nullish(),
  postcode: z.string().nullish(),
  townCity: z.string().nullish(),

  iceContactName: z.string().nullish(),
  iceContactPhoneNumber: z.string().nullish(),

  isTrainingProgramPilot: z.boolean(),
  canMakeReservations: z.boolean(),
  billingId: z.string().nullish(),
  dateOfBirth: z.string().date().nullish(),
  memberSince: z.string().date(),

  createdAt: z.string().datetime(),
  createdBy: z.string(),
  updatedAt: z.string().datetime(),
  updatedBy: z.string(),
  emailVerifiedAt: z.string().datetime().optional(),

  roles: z.array(z.nativeEnum(MIKRoles)),
})

export type Member = z.infer<typeof MemberSchema>

export type MemberResponse = z.infer<typeof MemberSchema>
