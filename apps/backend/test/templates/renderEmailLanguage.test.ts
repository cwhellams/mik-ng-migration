import { describe, expect, it, jest } from '@jest/globals'
import { MIKLang } from '../../src/routes/members/models.ts'

// A template that exists only in English while still declaring translated
// subjects and a translated footer. The registry interface allows that
// combination — it is what `languages` and `footer` mean — but no entry uses it
// yet, so this stands in for the next one that does. Mocking the registry is
// the only way to cover it: the real table is the thing under test everywhere
// else.
jest.unstable_mockModule('../../src/templates/registry.ts', () => ({
  EMAIL_LANGUAGES: ['en', 'fi', 'sv'],
  emailTemplates: {
    'new-member': {
      subject: {
        en: 'New member registered',
        fi: 'Uusi jäsen rekisteröitynyt',
        sv: 'Ny medlem registrerad',
      },
      footer: {
        en: 'English footer',
        fi: 'Suomenkielinen alatunniste',
        sv: 'Svensk fottext',
      },
      languages: ['en'],
    },
  },
}))

const markdownEmailTemplateMock = jest.fn((..._args: unknown[]) => '<html>ok</html>')

jest.unstable_mockModule('../../src/templates/emailTemplate.ts', () => ({
  markdownEmailTemplate: markdownEmailTemplateMock,
}))

const { renderEmail } = await import('../../src/templates/renderEmail.ts')

describe('renderEmail language resolution', () => {
  const vars = { firstName: 'Tester', href: 'https://example.com/club/members' }

  it('keeps subject, footer and body in one language when the body is English-only', () => {
    const { subject } = renderEmail('new-member', MIKLang.FI, vars)

    // Not 'Uusi jäsen rekisteröitynyt': a Finnish subject and footer wrapped
    // around an English body is a worse email than a consistently English one.
    expect(subject).toBe('New member registered')
    expect(markdownEmailTemplateMock).toHaveBeenCalledWith(
      'new-member-en.md',
      expect.anything(),
      'English footer',
    )
  })
})
