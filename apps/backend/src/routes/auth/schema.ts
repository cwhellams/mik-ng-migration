import { z } from 'zod'

import { JWTPayloadSchema } from './user.ts'

export const LoginRequestSchema = z.object({
  destination: z.string().optional(),
  token: z.string().optional(),
})
export type LoginRequest = z.infer<typeof LoginRequestSchema>

export const LoginResponseSchema = z.object({
  accessToken: z.string().optional(),
  user: JWTPayloadSchema.optional(),
  code: z.string().optional(),
})
export type LoginResponse = z.infer<typeof LoginResponseSchema>
