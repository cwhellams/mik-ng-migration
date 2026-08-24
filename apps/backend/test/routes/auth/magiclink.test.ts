import { jest, describe, it, expect } from '@jest/globals'

// Module mocks must be set up BEFORE importing the module under test.
process.env.PUBLIC_URL = 'https://beta.mik.fi'

jest.unstable_mockModule('../../../src/util/corsOrigins.ts', () => ({
  corsOrigins: ['https://beta.mik.fi', 'https://beta-twr.mik.fi'],
}))

const { resolveMagicLinkOrigin, buildMagicLinkHref } =
  await import('../../../src/routes/auth/magiclink.ts')

/**
 * #1233 gave the admin app its own subdomain, and with it a bug: a login
 * started on beta-twr.mik.fi used to always email a link back to the member
 * app's /login/validate, because the callback host was one global PUBLIC_URL
 * with no notion of which app asked. These pin the fix — the callback now
 * follows the request's Origin header, but only when it is in the same
 * allowlist CORS itself trusts.
 */
describe('resolveMagicLinkOrigin', () => {
  it('uses the requesting app’s origin when it is in the CORS allowlist', () => {
    expect(resolveMagicLinkOrigin('https://beta-twr.mik.fi')).toBe('https://beta-twr.mik.fi')
  })

  it('falls back to PUBLIC_URL (the member app) for an origin outside the allowlist', () => {
    // Prevents the callback host becoming an open redirect: only an Origin
    // CORS itself would also trust is ever used to build the emailed link.
    expect(resolveMagicLinkOrigin('https://evil.example')).toBe('https://beta.mik.fi')
  })

  it('falls back to PUBLIC_URL when no Origin header was sent', () => {
    expect(resolveMagicLinkOrigin(undefined)).toBe('https://beta.mik.fi')
  })
})

describe('buildMagicLinkHref', () => {
  it('builds the callback against the given origin, with the token and target', () => {
    expect(buildMagicLinkHref('tok123', 'https://beta-twr.mik.fi', '/dashboard')).toBe(
      'https://beta-twr.mik.fi/login/validate?token=tok123&target=%2Fdashboard',
    )
  })

  it('omits the target param when none is given', () => {
    expect(buildMagicLinkHref('tok123', 'https://beta.mik.fi')).toBe(
      'https://beta.mik.fi/login/validate?token=tok123',
    )
  })
})
