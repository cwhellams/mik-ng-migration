import { z } from 'zod'

import { MemberSchema } from '../members/models.ts'

// register

export const RegisterRequestSchema = MemberSchema.omit({
  memberId: true,
  iceContactName: true,
  iceContactPhoneNumber: true,

  isTrainingProgramPilot: true,
  canMakeReservations: true,
  billingId: true,
  memberSince: true,

  createdAt: true,
  createdBy: true,
  updatedAt: true,
  updatedBy: true,
  emailVerifiedAt: true,
  roles: true,
})
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>

// login

export const LoginRequestSchema = z.object({
  // email of the user to log in
  email: z.string(),

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
