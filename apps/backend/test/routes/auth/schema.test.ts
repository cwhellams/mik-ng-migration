import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals'
import { RegisterRequestSchema, calculateAge } from '@mik/contracts/auth'
import { MIKLang, MIKMemberTypes } from '@mik/contracts/members'

// Freeze to a stable mid-year date so tests never break on year/month boundaries.
const FROZEN_DATE = new Date('2024-06-15T12:00:00Z')

beforeAll(() => {
  jest.useFakeTimers()
  jest.setSystemTime(FROZEN_DATE)
})

afterAll(() => {
  jest.useRealTimers()
})

const baseValidMember = {
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  streetAddress: 'Test Street 1',
  postcode: '00100',
  townCity: 'Helsinki',
  memberType: MIKMemberTypes.FLYING,
  lang: MIKLang.FI,
}

function dateOfBirthForAge(age: number): string {
  const year = FROZEN_DATE.getUTCFullYear() - age
  const month = String(FROZEN_DATE.getUTCMonth() + 1).padStart(2, '0')
  const day = String(FROZEN_DATE.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

describe('calculateAge', () => {
  it('should return 17 for someone born exactly 17 years ago', () => {
    expect(calculateAge(dateOfBirthForAge(17))).toBe(17)
  })

  it('should return 18 for someone born exactly 18 years ago', () => {
    expect(calculateAge(dateOfBirthForAge(18))).toBe(18)
  })

  it('should return NaN for an invalid date string', () => {
    expect(calculateAge('not-a-date')).toBeNaN()
  })

  it('should return NaN for out-of-range month', () => {
    expect(calculateAge('2000-13-01')).toBeNaN()
  })

  it('should return NaN for out-of-range day', () => {
    expect(calculateAge('2000-01-40')).toBeNaN()
  })

  it('should return NaN for a non-existent calendar date', () => {
    expect(calculateAge('2023-02-30')).toBeNaN()
  })

  it('should return a negative number for a future date', () => {
    const futureYear = FROZEN_DATE.getUTCFullYear() + 1
    const month = String(FROZEN_DATE.getUTCMonth() + 1).padStart(2, '0')
    const day = String(FROZEN_DATE.getUTCDate()).padStart(2, '0')
    expect(calculateAge(`${futureYear}-${month}-${day}`)).toBeLessThan(0)
  })
})

describe('RegisterRequestSchema – junior membership age validation', () => {
  it('accepts junior membership for a 17-year-old', () => {
    const result = RegisterRequestSchema.safeParse({
      ...baseValidMember,
      memberType: MIKMemberTypes.JUNIOR,
      dateOfBirth: dateOfBirthForAge(17),
    })
    expect(result.success).toBe(true)
  })

  it('rejects junior membership for an 18-year-old', () => {
    const result = RegisterRequestSchema.safeParse({
      ...baseValidMember,
      memberType: MIKMemberTypes.JUNIOR,
      dateOfBirth: dateOfBirthForAge(18),
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('under 18')
    }
  })

  it('rejects junior membership for a 30-year-old', () => {
    const result = RegisterRequestSchema.safeParse({
      ...baseValidMember,
      memberType: MIKMemberTypes.JUNIOR,
      dateOfBirth: dateOfBirthForAge(30),
    })
    expect(result.success).toBe(false)
  })

  it('rejects junior membership when dateOfBirth is in the future', () => {
    const futureYear = FROZEN_DATE.getUTCFullYear() + 1
    const month = String(FROZEN_DATE.getUTCMonth() + 1).padStart(2, '0')
    const day = String(FROZEN_DATE.getUTCDate()).padStart(2, '0')
    const result = RegisterRequestSchema.safeParse({
      ...baseValidMember,
      memberType: MIKMemberTypes.JUNIOR,
      dateOfBirth: `${futureYear}-${month}-${day}`,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('future')
    }
  })

  it('rejects junior membership when dateOfBirth is missing', () => {
    const result = RegisterRequestSchema.safeParse({
      ...baseValidMember,
      memberType: MIKMemberTypes.JUNIOR,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('Date of birth is required')
    }
  })

  it('accepts flying membership without dateOfBirth', () => {
    const result = RegisterRequestSchema.safeParse({
      ...baseValidMember,
      memberType: MIKMemberTypes.FLYING,
    })
    expect(result.success).toBe(true)
  })

  it('accepts flying membership for an under-18 applicant', () => {
    const result = RegisterRequestSchema.safeParse({
      ...baseValidMember,
      memberType: MIKMemberTypes.FLYING,
      dateOfBirth: dateOfBirthForAge(16),
    })
    expect(result.success).toBe(true)
  })
})

const baseExternalMember = {
  email: 'external@example.com',
  firstName: 'External',
  lastName: 'User',
  memberType: MIKMemberTypes.EXTERNAL,
  lang: MIKLang.FI,
}

describe('RegisterRequestSchema – EXTERNAL member address fields', () => {
  it('accepts EXTERNAL member without any address fields', () => {
    const result = RegisterRequestSchema.safeParse(baseExternalMember)
    expect(result.success).toBe(true)
  })

  it('accepts EXTERNAL member with empty-string address fields (preprocessed to undefined)', () => {
    const result = RegisterRequestSchema.safeParse({
      ...baseExternalMember,
      streetAddress: '',
      postcode: '',
      townCity: '',
    })
    expect(result.success).toBe(true)
  })

  it('accepts EXTERNAL member with partial address fields', () => {
    const result = RegisterRequestSchema.safeParse({
      ...baseExternalMember,
      streetAddress: 'Some Street 1',
    })
    expect(result.success).toBe(true)
  })

  it('rejects non-EXTERNAL member without address fields', () => {
    const result = RegisterRequestSchema.safeParse({
      email: 'flying@example.com',
      firstName: 'Flying',
      lastName: 'User',
      memberType: MIKMemberTypes.FLYING,
      lang: MIKLang.FI,
    })
    expect(result.success).toBe(false)
  })

  it('rejects non-EXTERNAL member with empty-string address fields', () => {
    const result = RegisterRequestSchema.safeParse({
      email: 'flying@example.com',
      firstName: 'Flying',
      lastName: 'User',
      memberType: MIKMemberTypes.FLYING,
      lang: MIKLang.FI,
      streetAddress: '',
      postcode: '',
      townCity: '',
    })
    expect(result.success).toBe(false)
  })
})

describe('RegisterRequestSchema – postcode format validation', () => {
  it('rejects EXTERNAL member with non-digits-only postcode', () => {
    const result = RegisterRequestSchema.safeParse({
      ...baseExternalMember,
      postcode: 'ABC',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('postcode')
    }
  })

  it('accepts EXTERNAL member with digits-only postcode', () => {
    const result = RegisterRequestSchema.safeParse({
      ...baseExternalMember,
      postcode: '00100',
    })
    expect(result.success).toBe(true)
  })

  it('rejects non-EXTERNAL member with non-digits-only postcode', () => {
    const result = RegisterRequestSchema.safeParse({
      ...baseValidMember,
      postcode: 'ABCDE',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const postcodeIssue = result.error.issues.find((i) => i.path.includes('postcode'))
      expect(postcodeIssue).toBeDefined()
    }
  })
})

describe('RegisterRequestSchema – phone number preprocessing', () => {
  it('converts empty-string phoneNumber to null', () => {
    const result = RegisterRequestSchema.safeParse({
      ...baseValidMember,
      phoneNumber: '',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.phoneNumber).toBeNull()
    }
  })

  it('accepts a valid phone number', () => {
    const result = RegisterRequestSchema.safeParse({
      ...baseValidMember,
      phoneNumber: '+358401234567',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.phoneNumber).toBe('+358401234567')
    }
  })

  it('accepts null phoneNumber', () => {
    const result = RegisterRequestSchema.safeParse({
      ...baseValidMember,
      phoneNumber: null,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.phoneNumber).toBeNull()
    }
  })
})
