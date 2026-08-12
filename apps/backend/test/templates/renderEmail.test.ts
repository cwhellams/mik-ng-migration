import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { existsSync } from 'node:fs'
import { MIKLang } from '@mik/contracts/members'

const markdownEmailTemplateMock = jest.fn((...args: unknown[]) => '<html>ok</html>')

jest.unstable_mockModule('../../src/templates/emailTemplate.ts', () => ({
  markdownEmailTemplate: markdownEmailTemplateMock,
}))

const { renderEmail, normaliseEmailLang } = await import('../../src/templates/renderEmail.ts')
const { emailTemplates, EMAIL_LANGUAGES } = await import('../../src/templates/registry.ts')

const BILLING_EMAIL = 'laskutus@mik.fi'

// The markdown renderer is mocked throughout: these tests are about the
// registry's dispatch (which file, which subject, which footer, which
// constants), not about the rendered HTML. Rendered output is covered by the
// snapshots in email.test.ts.

describe('renderEmail', () => {
  const originalPublicUrl = process.env.PUBLIC_URL
  const newMemberVars = { firstName: 'Tester', href: 'https://example.com/club/members' }
  const suspendedVars = {
    firstName: 'Tester',
    invoiceCount: 2,
    totalAmount: 150,
    cancelledBookingsCount: 3,
  }

  afterEach(() => {
    markdownEmailTemplateMock.mockClear()

    if (originalPublicUrl === undefined) {
      delete process.env.PUBLIC_URL
      return
    }

    process.env.PUBLIC_URL = originalPublicUrl
  })

  describe('language selection', () => {
    it.each([
      [MIKLang.FI, 'new-member-fi.md'],
      [MIKLang.SV, 'new-member-sv.md'],
      [MIKLang.EN, 'new-member-en.md'],
    ])('renders the %s markdown file', (lang, file) => {
      renderEmail('new-member', lang, newMemberVars)

      expect(markdownEmailTemplateMock).toHaveBeenCalledWith(file, newMemberVars, undefined)
    })

    it('falls back to English for an undefined language', () => {
      renderEmail('new-member', undefined, newMemberVars)

      expect(markdownEmailTemplateMock).toHaveBeenCalledWith(
        'new-member-en.md',
        newMemberVars,
        undefined,
      )
    })

    it('falls back to English for a language we do not translate into', () => {
      renderEmail('new-member', 'de', newMemberVars)

      expect(markdownEmailTemplateMock).toHaveBeenCalledWith(
        'new-member-en.md',
        newMemberVars,
        undefined,
      )
    })

    it('uses the English body for English-only templates even in Finnish', () => {
      renderEmail('aircraft-document-expired', MIKLang.FI, {
        documentType: 'ARC',
        documentTitle: 'Airworthiness Review Certificate',
        expiryDate: '01.01.2026',
        aircraftRegistration: 'OH-STL',
      })

      expect(markdownEmailTemplateMock).toHaveBeenCalledWith(
        'aircraft-document-expired-en.md',
        expect.anything(),
        undefined,
      )
    })
  })

  describe('subjects', () => {
    const expenseVars = { memberName: 'Tester', claimUrl: 'https://example.com/expenses/1' }

    it.each([
      [MIKLang.FI, 'Uusi jäsen rekisteröitynyt'],
      [MIKLang.SV, 'Ny medlem registrerad'],
      [MIKLang.EN, 'New member registered'],
    ])('returns the %s subject', (lang, expected) => {
      expect(renderEmail('new-member', lang, newMemberVars).subject).toBe(expected)
    })

    it('returns the English subject for unknown languages', () => {
      expect(renderEmail('new-member', 'de', newMemberVars).subject).toBe('New member registered')
      expect(renderEmail('new-member', undefined, newMemberVars).subject).toBe(
        'New member registered',
      )
    })

    it('interpolates vars into the subject', () => {
      expect(
        renderEmail('expense-approved', MIKLang.EN, { ...expenseVars, claimTitle: 'Fuel receipt' })
          .subject,
      ).toBe('Expense claim approved: Fuel receipt')
    })

    it('does not HTML-escape subject values', () => {
      expect(
        renderEmail('expense-approved', MIKLang.EN, { ...expenseVars, claimTitle: 'Fuel & oil' })
          .subject,
      ).toBe('Expense claim approved: Fuel & oil')
    })

    it.each([
      [MIKLang.FI, 'Lentokoneen varausoikeus keskeytetty'],
      [MIKLang.SV, 'Flygplansreservationsrättigheter har upphävts'],
      [MIKLang.EN, 'Aircraft Reservation Privileges Suspended'],
    ])('returns the %s reservation suspended subject', (lang, expected) => {
      expect(renderEmail('reservation-suspended', lang, suspendedVars).subject).toBe(expected)
    })
  })

  describe('footers', () => {
    it('passes the language-specific footer through to the renderer', () => {
      renderEmail('email-change-verify', MIKLang.FI, {
        firstName: 'Tester',
        newEmail: 'new@example.com',
        href: 'https://example.com/verify',
      })

      expect(markdownEmailTemplateMock).toHaveBeenCalledWith(
        'email-change-verify-fi.md',
        expect.anything(),
        'Jos et pyytänyt tätä muutosta, voit huoletta sivuuttaa tämän sähköpostin.',
      )
    })

    it('passes no footer for templates that declare none', () => {
      renderEmail('new-member', MIKLang.FI, newMemberVars)

      expect(markdownEmailTemplateMock).toHaveBeenCalledWith(
        'new-member-fi.md',
        expect.anything(),
        undefined,
      )
    })
  })

  describe('default vars', () => {
    it('passes a default localhost href when PUBLIC_URL is not set', () => {
      delete process.env.PUBLIC_URL

      const result = renderEmail('reservation-suspended', MIKLang.FI, suspendedVars)

      expect(result.html).toBe('<html>ok</html>')
      expect(markdownEmailTemplateMock).toHaveBeenCalledWith(
        'reservation-suspended-fi.md',
        { ...suspendedVars, BILLING_EMAIL, href: 'http://localhost:5173/club/billing' },
        undefined,
      )
    })

    it('reads PUBLIC_URL at send time, not at import time', () => {
      process.env.PUBLIC_URL = 'https://portal.mik.fi'

      renderEmail('reservation-suspended', MIKLang.SV, suspendedVars)

      expect(markdownEmailTemplateMock).toHaveBeenCalledWith(
        'reservation-suspended-sv.md',
        { ...suspendedVars, BILLING_EMAIL, href: 'https://portal.mik.fi/club/billing' },
        undefined,
      )
    })

    it('keeps the registry constant when a caller supplies the same key', () => {
      delete process.env.PUBLIC_URL

      // The vars types stop a call site naming `href` outright, but a payload
      // spread from a wider object (a member or invoice row, say) carries no
      // excess-property check — the template's own constants still win, as
      // they did when each wrapper spread them last.
      const varsFromAWiderObject = { ...suspendedVars, href: '/somewhere-else' }
      renderEmail('reservation-suspended', MIKLang.EN, varsFromAWiderObject)

      expect(markdownEmailTemplateMock).toHaveBeenCalledWith(
        'reservation-suspended-en.md',
        expect.objectContaining({ href: 'http://localhost:5173/club/billing' }),
        undefined,
      )
    })
  })
})

describe('normaliseEmailLang', () => {
  it.each([
    ['fi', 'fi'],
    ['sv', 'sv'],
    ['en', 'en'],
    ['de', 'en'],
    [undefined, 'en'],
  ])('maps %s to %s', (input, expected) => {
    expect(normaliseEmailLang(input)).toBe(expected)
  })
})

describe('template registry', () => {
  it('declares a subject in every language for every template', () => {
    for (const [key, spec] of Object.entries(emailTemplates)) {
      for (const lang of EMAIL_LANGUAGES) {
        expect(`${key}.${lang}: ${spec.subject[lang] ?? ''}`).not.toMatch(/: $/)
      }
    }
  })

  // The registry is now the only place a template's markdown filename is
  // spelled out, so a typo would only surface as a readFileSync crash at send
  // time. This walks every declared key/language pair instead.
  it('has a markdown file on disk for every declared key and language', () => {
    const missing: string[] = []

    for (const [key, spec] of Object.entries(emailTemplates)) {
      const languages = 'languages' in spec ? spec.languages : EMAIL_LANGUAGES
      for (const lang of languages) {
        const file = `src/templates/${key}-${lang}.md`
        if (!existsSync(file)) missing.push(file)
      }
    }

    expect(missing).toEqual([])
  })
})
