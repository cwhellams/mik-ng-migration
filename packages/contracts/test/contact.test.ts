import { describe, expect, it } from 'vitest'

import { ContactCategory, ContactRequestSchema } from '../src/contact.ts'

const validRequest = {
  name: 'Alex Pilot',
  email: 'alex@example.com',
  category: ContactCategory.TRAINING,
  message: 'Hello there',
  lang: 'en' as const,
}

describe('ContactRequestSchema', () => {
  it('rejects empty name', () => {
    expect(ContactRequestSchema.safeParse({ ...validRequest, name: '   ' }).success).toBe(false)
  })

  it('rejects name > 100 chars', () => {
    expect(ContactRequestSchema.safeParse({ ...validRequest, name: 'a'.repeat(101) }).success).toBe(
      false,
    )
  })

  it('rejects invalid email', () => {
    expect(ContactRequestSchema.safeParse({ ...validRequest, email: 'not-an-email' }).success).toBe(
      false,
    )
  })

  it('rejects empty message', () => {
    expect(ContactRequestSchema.safeParse({ ...validRequest, message: '   ' }).success).toBe(false)
  })

  it('rejects message > 4000 chars', () => {
    expect(
      ContactRequestSchema.safeParse({ ...validRequest, message: 'a'.repeat(4001) }).success,
    ).toBe(false)
  })

  it('rejects invalid category', () => {
    expect(ContactRequestSchema.safeParse({ ...validRequest, category: 'WRONG' }).success).toBe(
      false,
    )
  })

  it('rejects missing lang', () => {
    const { lang: _lang, ...withoutLang } = validRequest
    expect(ContactRequestSchema.safeParse(withoutLang).success).toBe(false)
  })

  it('accepts valid request', () => {
    expect(ContactRequestSchema.parse(validRequest)).toEqual(validRequest)
  })
})
