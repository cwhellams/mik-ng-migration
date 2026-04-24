import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { MIKLang } from '../../src/routes/members/models.ts'

const markdownEmailTemplateMock = jest.fn(() => '<html>ok</html>')

jest.unstable_mockModule('../../src/templates/emailTemplate.ts', () => ({
  markdownEmailTemplate: markdownEmailTemplateMock,
}))

const { newMemberEmailSubject, newMemberEmailBodyHtml } = await import(
  '../../src/templates/newMemberEmailTemplate.ts'
)

describe('newMemberEmailTemplate', () => {
  const originalPublicUrl = process.env.PUBLIC_URL

  afterEach(() => {
    markdownEmailTemplateMock.mockClear()

    if (originalPublicUrl === undefined) {
      delete process.env.PUBLIC_URL
      return
    }

    process.env.PUBLIC_URL = originalPublicUrl
  })

  describe('newMemberEmailSubject', () => {
    it('returns Finnish subject for fi', () => {
      expect(newMemberEmailSubject('fi')).toBe('Uusi jäsen rekisteröitynyt')
    })

    it('returns Swedish subject for sv', () => {
      expect(newMemberEmailSubject('sv')).toBe('Ny medlem registrerad')
    })

    it('returns English subject for en', () => {
      expect(newMemberEmailSubject('en')).toBe('New member registered')
    })

    it('returns English subject for unknown languages', () => {
      expect(newMemberEmailSubject('de')).toBe('New member registered')
      expect(newMemberEmailSubject(undefined)).toBe('New member registered')
    })
  })

  describe('newMemberEmailBodyHtml', () => {
    const vars = {
      firstName: 'Tester',
      href: 'https://example.com/club/members',
    }

    it('calls correct Finnish template', () => {
      newMemberEmailBodyHtml(MIKLang.FI, vars)

      expect(markdownEmailTemplateMock).toHaveBeenCalledWith('new-member-fi.md', vars)
    })

    it('calls correct Swedish template', () => {
      newMemberEmailBodyHtml(MIKLang.SV, vars)

      expect(markdownEmailTemplateMock).toHaveBeenCalledWith('new-member-sv.md', vars)
    })

    it('calls correct English template', () => {
      newMemberEmailBodyHtml(MIKLang.EN, vars)

      expect(markdownEmailTemplateMock).toHaveBeenCalledWith('new-member-en.md', vars)
    })

    it('falls back to English template for undefined lang', () => {
      newMemberEmailBodyHtml(undefined, vars)

      expect(markdownEmailTemplateMock).toHaveBeenCalledWith('new-member-en.md', vars)
    })

    it('falls back to English template for unsupported lang', () => {
      newMemberEmailBodyHtml('de' as MIKLang, vars)

      expect(markdownEmailTemplateMock).toHaveBeenCalledWith('new-member-en.md', vars)
    })
    it('returns html from markdownEmailTemplate', () => {
      const result = newMemberEmailBodyHtml(MIKLang.EN, vars)

      expect(result).toBe('<html>ok</html>')
    })
  })
})
