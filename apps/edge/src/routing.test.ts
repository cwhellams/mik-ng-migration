import { describe, expect, it } from 'vitest'
import { ADMIN_BASE, isOriginPath, spaFallbackFor } from './routing'

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

  it('mounts the admin app where the admin bundle is built to expect', () => {
    // scripts/build-assets.sh builds apps/admin with `base: ADMIN_BASE + "/"`.
    // If the two ever disagree the admin app serves a blank page.
    expect(ADMIN_BASE).toBe('/admin')
  })

  it('falls back for a navigation', () => {
    expect(spaFallbackFor(new Request('https://x/bookings', navigation))).toBe('/index.html')
  })

  // The two apps are separate bundles. Answering an admin deep-link with the
  // member app's index.html loads the wrong application, silently.
  it.each(['/admin', '/admin/', '/admin/shop/orders'])('sends %s to the admin bundle', (path) => {
    expect(spaFallbackFor(new Request(`https://x${path}`, navigation))).toBe('/admin/index.html')
  })

  it('does not treat /administration as the admin app', () => {
    expect(spaFallbackFor(new Request('https://x/administration', navigation))).toBe('/index.html')
  })

  it('leaves a missing admin chunk as a 404 too', () => {
    const req = new Request('https://x/admin/assets/gone.js', { headers: { accept: '*/*' } })
    expect(spaFallbackFor(req)).toBeNull()
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
