import { z } from 'zod'

import {
  ApplicationDataSchema,
  MemberProfileSchema,
  MIKLang,
  MIKMemberTypes,
} from '../members/models.ts'

// Calculate age in full years from a YYYY-MM-DD date string.
// Returns NaN if the date string is invalid (wrong format, out-of-range components, or non-existent calendar date).
// Parses components manually to avoid timezone-dependent Date parsing of YYYY-MM-DD strings
// (JS parses them as UTC midnight, so local month/day can shift in non-UTC timezones).
export function calculateAge(dateOfBirth: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth)
  if (!match) return NaN
  const birthYear = parseInt(match[1], 10)
  const birthMonth = parseInt(match[2], 10) // 1–12
  const birthDay = parseInt(match[3], 10)
  // Validate component ranges and calendar validity via UTC round-trip.
  // Invalid values like month 13 or day 40 cause JS to roll over to different dates,
  // so the round-trip values will differ from the originals.
  const utcDate = new Date(Date.UTC(birthYear, birthMonth - 1, birthDay))
  if (
    utcDate.getUTCFullYear() !== birthYear ||
    utcDate.getUTCMonth() + 1 !== birthMonth ||
    utcDate.getUTCDate() !== birthDay
  ) {
    return NaN
  }
  const today = new Date()
  const todayYear = today.getUTCFullYear()
  const todayMonth = today.getUTCMonth() + 1 // 1–12
  const todayDay = today.getUTCDate()
  let age = todayYear - birthYear
  if (todayMonth < birthMonth || (todayMonth === birthMonth && todayDay < birthDay)) {
    age--
  }
  return age
}

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

  // application data for membership review
  applicationData: ApplicationDataSchema.optional(),
}).superRefine((data, ctx) => {
  if (data.memberType === MIKMemberTypes.JUNIOR) {
    if (!data.dateOfBirth) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Date of birth is required for junior membership',
        path: ['dateOfBirth'],
      })
      return
    }
    const age = calculateAge(data.dateOfBirth)
    if (isNaN(age)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Date of birth must be a valid date',
        path: ['dateOfBirth'],
      })
      return
    }
    if (age < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Date of birth must not be in the future',
        path: ['dateOfBirth'],
      })
      return
    }
    if (age >= 18) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Junior membership is only available for members under 18 years old',
        path: ['dateOfBirth'],
      })
    }
  }
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
