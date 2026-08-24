import { describe, it, expect } from '@jest/globals'

import { parseAllowedOrigins } from '../../src/util/corsOrigins.ts'

/**
 * The beta admin app's login died in CORS preflight because the configured
 * value ended in a slash: `https://beta-twr.mik.fi/`. A browser's Origin header
 * is scheme + host + port and never has a trailing slash, and the allowlist is
 * matched by exact string equality — so that entry matched nothing, no
 * Access-Control-Allow-Origin came back, and every admin request failed.
 */
describe('parseAllowedOrigins', () => {
  it('strips a trailing slash so the entry matches a real Origin header', () => {
    expect(parseAllowedOrigins('https://beta-twr.mik.fi/')).toEqual(['https://beta-twr.mik.fi'])
  })

  it('parses the exact beta value that broke, slash and stray space included', () => {
    expect(
      parseAllowedOrigins(
        'https://beta.mik.fi,https://walrus-app-sa62h.ondigitalocean.app,http://localhost:5173, https://beta-twr.mik.fi/',
      ),
    ).toEqual([
      'https://beta.mik.fi',
      'https://walrus-app-sa62h.ondigitalocean.app',
      'http://localhost:5173',
      'https://beta-twr.mik.fi',
    ])
  })

  it('keeps a non-default port but drops a default one, matching Origin semantics', () => {
    expect(parseAllowedOrigins('http://localhost:5173,https://beta.mik.fi:443')).toEqual([
      'http://localhost:5173',
      'https://beta.mik.fi',
    ])
  })

  it('lowercases the host and discards any path', () => {
    expect(parseAllowedOrigins('https://BETA-TWR.mik.fi/api/auth')).toEqual([
      'https://beta-twr.mik.fi',
    ])
  })

  it('rejects the wildcard, which cannot be used with credentialed requests', () => {
    expect(parseAllowedOrigins('*,https://beta.mik.fi')).toEqual(['https://beta.mik.fi'])
  })

  it('drops unparseable entries rather than keeping ones that can never match', () => {
    expect(parseAllowedOrigins('beta-twr.mik.fi,https://beta.mik.fi')).toEqual([
      'https://beta.mik.fi',
    ])
  })

  it('returns an empty list for unset or empty configuration', () => {
    expect(parseAllowedOrigins(undefined)).toEqual([])
    expect(parseAllowedOrigins('')).toEqual([])
    expect(parseAllowedOrigins(' , ')).toEqual([])
  })
})
