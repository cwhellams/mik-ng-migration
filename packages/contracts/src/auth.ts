import { z } from 'zod'

import { ApplicationDataSchema, MemberProfileSchema, MIKLang, MIKMemberTypes } from './members.ts'
import { optionalTrimmedString } from './schema.ts'

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

// Minimal issue shape both z.RefinementCtx#addIssue and a manually-thrown
// ZodError-like Problem response can consume.
export interface JuniorAgeIssue {
  [x: string]: unknown
  code: 'custom'
  message: string
  path: string[]
}

// Checks the JUNIOR-membership age window (15-17 inclusive) for a given
// memberType/dateOfBirth pair. Returns the issues to raise, or an empty
// array when the pair is fine (including when memberType isn't JUNIOR).
// Shared by RegisterRequestSchema's superRefine and by backend routes that can
// leave a member in this state outside registration (e.g. admin edits that
// change memberType or dateOfBirth independently of each other).
export function juniorAgeIssues(
  memberType: MIKMemberTypes,
  dateOfBirth: string | null | undefined,
): JuniorAgeIssue[] {
  if (memberType !== MIKMemberTypes.JUNIOR) return []

  if (!dateOfBirth) {
    return [
      {
        code: z.ZodIssueCode.custom,
        message: 'Date of birth is required for junior membership',
        path: ['dateOfBirth'],
      },
    ]
  }

  const age = calculateAge(dateOfBirth)
  if (isNaN(age)) {
    return [
      {
        code: z.ZodIssueCode.custom,
        message: 'Date of birth must be a valid date',
        path: ['dateOfBirth'],
      },
    ]
  }
  if (age < 0) {
    return [
      {
        code: z.ZodIssueCode.custom,
        message: 'Date of birth must not be in the future',
        path: ['dateOfBirth'],
      },
    ]
  }

  const issues: JuniorAgeIssue[] = []
  if (age >= 18) {
    issues.push({
      code: z.ZodIssueCode.custom,
      message: 'Junior membership is only available for members under 18 years old',
      path: ['dateOfBirth'],
    })
  }
  // Finnish Guardianship Services Act (laki holhoustoimesta, 442/1999) § 25 lets a
  // person who has turned 15 join an association without guardian consent — below
  // that, membership isn't something the applicant can request on their own.
  if (age < 15) {
    issues.push({
      code: z.ZodIssueCode.custom,
      message: 'Junior membership is only available for members aged 15 or older',
      path: ['dateOfBirth'],
    })
  }
  return issues
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

  // Address fields are optional at schema level; conditionally required below for non-EXTERNAL types
  streetAddress: optionalTrimmedString(),
  postcode: optionalTrimmedString(),
  townCity: optionalTrimmedString(),
  country: z
    .string()
    .regex(/^[A-Z]{2}$/, 'member.countryInvalid')
    .default('FI'),
}).superRefine((data, ctx) => {
  for (const issue of juniorAgeIssues(data.memberType, data.dateOfBirth)) {
    ctx.addIssue(issue)
  }

  // Postcode must be digits-only whenever provided (all member types)
  if (data.postcode && !/^\d+$/.test(data.postcode)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'member.postcodeDigitsOnly',
      path: ['postcode'],
    })
  }

  // Address fields are required for all non-EXTERNAL member types
  if (data.memberType !== MIKMemberTypes.EXTERNAL) {
    if (!data.streetAddress?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Street address is required',
        path: ['streetAddress'],
      })
    }
    if (!data.postcode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'member.postcodeDigitsOnly',
        path: ['postcode'],
      })
    }
    if (!data.townCity?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Town/city is required',
        path: ['townCity'],
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
