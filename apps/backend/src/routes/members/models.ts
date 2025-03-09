import { z } from 'zod'

// member list endpoint

const MemberListSchema = z.object({
  name: z.string(),
  memberId: z.number(),
  phoneNumber: z.string().nullish(),
})

export type MemberList = z.infer<typeof MemberListSchema>

const MemberListResponseSchema = z.object({
  members: z.array(MemberListSchema),
})

export type MemberListResponse = z.infer<typeof MemberListResponseSchema>

// me-endpoint

const MemberSchema = z.object({
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
})
export type Member = z.infer<typeof MemberSchema>
