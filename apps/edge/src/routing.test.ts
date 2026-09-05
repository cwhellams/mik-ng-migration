import { describe, expect, it } from 'vitest'
import { isOriginPath, spaFallbackFor } from './routing'

describe('isOriginPath', () => {
  it.each(['/api', '/api/v1/members', '/t', '/t/2cQ3', '/health'])('claims %s', (path) => {
    expect(isOriginPath(path)).toBe(true)
  })

  it.each(['/', '/bookings', '/assets/index-abc123.js', '/favicon.ico'])(
    'leaves %s to the assets binding',
    (path) => {
      expect(isOriginPath(path)).toBe(false)
    },
  )

  // A prefix match on the raw string would hand these to the API, which answers
  // 404 for them — and they are plausible SPA routes.
  it.each(['/apiary', '/tickets', '/healthcheck'])(
    'does not claim %s on a partial match',
    (path) => {
      expect(isOriginPath(path)).toBe(false)
    },
  )
})

describe('spaFallbackFor', () => {
  const navigation = { headers: { accept: 'text/html,application/xhtml+xml' } }

  it('falls back for a navigation', () => {
    expect(spaFallbackFor(new Request('https://x/bookings', navigation))).toBe('/index.html')
  })

  it('leaves a missing asset as a 404', () => {
    // Answering a missing chunk with index.html is what produces
    // "Unexpected token '<'" instead of a legible 404 on the chunk.
    const req = new Request('https://x/assets/gone.js', { headers: { accept: '*/*' } })
    expect(spaFallbackFor(req)).toBeNull()
  })

  it('leaves a non-GET alone', () => {
    const req = new Request('https://x/bookings', { method: 'POST', ...navigation })
    expect(spaFallbackFor(req)).toBeNull()
  })
})
