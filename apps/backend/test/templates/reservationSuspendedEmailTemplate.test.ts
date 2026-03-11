import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { MIKLang } from '../../src/routes/members/models.ts'

const markdownEmailTemplateMock = jest.fn(() => '<html>ok</html>')

jest.unstable_mockModule('../../src/templates/emailTemplate.ts', () => ({
  markdownEmailTemplate: markdownEmailTemplateMock,
}))

const { BILLING_EMAIL, reservationSuspendedEmailBodyHtml, reservationSuspendedEmailSubject } =
  await import('../../src/templates/reservationSuspendedEmailTemplate.ts')

describe('reservationSuspendedEmailTemplate', () => {
  const originalPublicUrl = process.env.PUBLIC_URL

  afterEach(() => {
    markdownEmailTemplateMock.mockClear()

    if (originalPublicUrl === undefined) {
      delete process.env.PUBLIC_URL
      return
    }

    process.env.PUBLIC_URL = originalPublicUrl
  })

  describe('reservationSuspendedEmailSubject', () => {
    it('returns Finnish subject for fi', () => {
      expect(reservationSuspendedEmailSubject('fi')).toBe('Lentokoneen varausoikeus keskeytetty')
    })

    it('returns Swedish subject for sv', () => {
      expect(reservationSuspendedEmailSubject('sv')).toBe(
        'Flygplansreservationsrättigheter har upphävts',
      )
    })

    it('returns English subject for unknown languages', () => {
      expect(reservationSuspendedEmailSubject('en')).toBe(
        'Aircraft Reservation Privileges Suspended',
      )
      expect(reservationSuspendedEmailSubject('de')).toBe(
        'Aircraft Reservation Privileges Suspended',
      )
    })
  })

  describe('reservationSuspendedEmailBodyHtml', () => {
    const vars = {
      firstName: 'Tester',
      invoiceCount: 2,
      totalAmount: 150,
      cancelledBookingsCount: 3,
    }

    it('passes default localhost href when PUBLIC_URL is not set', () => {
      delete process.env.PUBLIC_URL

      const result = reservationSuspendedEmailBodyHtml(MIKLang.FI, vars)

      expect(result).toBe('<html>ok</html>')
      expect(markdownEmailTemplateMock).toHaveBeenCalledWith('reservation-suspended-fi.md', {
        ...vars,
        BILLING_EMAIL,
        href: 'http://localhost:5173/club/billing',
      })
    })

    it('passes PUBLIC_URL based href when set', () => {
      process.env.PUBLIC_URL = 'https://portal.mik.fi'

      reservationSuspendedEmailBodyHtml(MIKLang.SV, vars)

      expect(markdownEmailTemplateMock).toHaveBeenCalledWith('reservation-suspended-sv.md', {
        ...vars,
        BILLING_EMAIL,
        href: 'https://portal.mik.fi/club/billing',
      })
    })
  })
})
