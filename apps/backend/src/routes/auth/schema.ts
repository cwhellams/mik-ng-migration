import { z } from 'zod'

import { MemberProfileSchema, MIKMemberTypes } from '../members/models.ts'

// register

export const RegisterRequestSchema = MemberProfileSchema.extend({
  // membertype can be selected when creating a new user
  memberType: z.nativeEnum(MIKMemberTypes),

  // language needed for sending emails
  lang: z.string().optional(),
  memberId: z.string().optional(),
})
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>

// login

export const LoginRequestSchema = z.object({
  // email of the user to log in
  email: z.string(),

  lang: z.string(),

  // where to navigate after login
  target: z.string().optional(),
})
export type LoginRequest = z.infer<typeof LoginRequestSchema>

export const LoginResponseSchema = z.object({
  // verification code
  code: z.number().optional(),

  error: z.string().optional(),
})
export type LoginResponse = z.infer<typeof LoginResponseSchema>

// verify

export const VerifyRequestSchema = z.object({
  token: z.string(),
})
export type VerifyRequest = z.infer<typeof VerifyRequestSchema>

export const VerifyResponseSchema = z.object({
  // pass token and user information back after verified login
  accessToken: z.string().optional(),

  error: z.string().optional(),
})
export type VerifyResponse = z.infer<typeof VerifyResponseSchema>
