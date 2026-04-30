import { z } from 'zod'

import { MemberProfileSchema, MIKLang, MIKMemberTypes } from '../members/models.ts'

// register

export const RegisterRequestSchema = MemberProfileSchema.extend({
  // email is required for registration (but not for profile self-edits)
  email: z.string().email(),

  // membertype can be selected when creating a new user
  memberType: z.nativeEnum(MIKMemberTypes),

  // language needed for sending emails
  lang: z.nativeEnum(MIKLang),

  // optional turnstile token for bot protection
  turnstileToken: z.string().optional(),
})
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>

// login

export const LoginRequestSchema = z.object({
  // email of the user to log in
  email: z.string(),

  // where to navigate after login
  target: z.string().optional(),

  // optional turnstile token for bot protection
  turnstileToken: z.string().optional(),
})
export type LoginRequest = z.infer<typeof LoginRequestSchema>

export const LoginResponseSchema = z.object({
  // verification code shown in the email and on-screen for PWA code entry
  // NOTE: the JWT token is NO LONGER returned here. The client must call
  // POST /login/verify-code with {email, code} to obtain access tokens.
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
  // Auth tokens are delivered via httpOnly cookies; this body just signals success.
  ok: z.boolean(),
})
export type VerifyResponse = z.infer<typeof VerifyResponseSchema>

// verify-code (PWA numeric code entry)

export const VerifyCodeRequestSchema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{5}$/, 'Code must be exactly 5 digits'),
})
export type VerifyCodeRequest = z.infer<typeof VerifyCodeRequestSchema>
