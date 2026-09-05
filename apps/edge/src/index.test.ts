import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker, { type Env } from './index'

const LEGACY_ORIGIN = 'https://legacy.example.test'

/** A stand-in for the Static Assets binding, backed by a path -> body map. */
function assetsFrom(files: Record<string, string>): Env['ASSETS'] {
  return {
    fetch: async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      const body = files[url.pathname]
      return body === undefined
        ? new Response('Not Found', { status: 404 })
        : new Response(body, { status: 200, headers: { 'content-type': 'text/html' } })
    },
  } as unknown as Env['ASSETS']
}

const bundle = {
  '/index.html': '<!doctype html>member app',
  '/assets/index-abc123.js': 'console.log(1)',
  '/admin/index.html': '<!doctype html>admin app',
  '/admin/assets/index-def456.js': 'console.log(2)',
}

let env: Env
let origin: ReturnType<typeof vi.fn>

beforeEach(() => {
  env = { ASSETS: assetsFrom(bundle), LEGACY_ORIGIN }
  origin = vi.fn(async () => new Response('from the origin', { status: 200 }))
  vi.stubGlobal('fetch', origin)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const get = (path: string, init?: RequestInit) =>
  worker.fetch(new Request(`https://intra.example.test${path}`, init), env)

describe('API origin', () => {
  it('proxies an API call with its path, query, method and cookies intact', async () => {
    const res = await get('/api/v1/members?page=2', {
      method: 'POST',
      headers: { cookie: 'intra_accessToken=abc', 'x-sudo': 'true' },
    })

    expect(res.status).toBe(200)
    const [proxied, init] = origin.mock.calls[0] as [Request, RequestInit]
    expect(proxied.url).toBe(`${LEGACY_ORIGIN}/api/v1/members?page=2`)
    expect(proxied.method).toBe('POST')
    expect(proxied.headers.get('cookie')).toBe('intra_accessToken=abc')
    expect(proxied.headers.get('x-sudo')).toBe('true')
    expect(proxied.headers.get('x-forwarded-host')).toBe('intra.example.test')
    expect(init.redirect).toBe('manual')
  })

  it('hands a tiny-URL redirect back unfollowed', async () => {
    // /t/:code answers 302 to a presigned storage URL. Following it here would
    // stream the file through the Worker under a URL the browser never asked for.
    origin.mockResolvedValue(
      new Response(null, { status: 302, headers: { location: 'https://storage/f.pdf' } }),
    )

    const res = await get('/t/2cQ3')

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://storage/f.pdf')
  })

  it.each(['/apiary', '/tickets', '/healthcheck'])(
    'does not proxy %s, which only prefix-matches',
    async (path) => {
      await get(path, { headers: { accept: 'text/html' } })
      expect(origin).not.toHaveBeenCalled()
    },
  )
})

describe('static assets', () => {
  it('serves a built asset without touching the origin', async () => {
    const res = await get('/assets/index-abc123.js')

    expect(await res.text()).toBe('console.log(1)')
    expect(origin).not.toHaveBeenCalled()
  })

  it('serves index.html for a client-side route', async () => {
    const res = await get('/bookings/123', { headers: { accept: 'text/html' } })

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('<!doctype html>member app')
  })

  it('serves the admin bundle for an admin deep link', async () => {
    // The apps are separate bundles: answering this with the member app's
    // index.html loads the wrong application without any visible error.
    const res = await get('/admin/shop/orders', { headers: { accept: 'text/html' } })

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('<!doctype html>admin app')
  })

  it('serves an admin asset from the admin bundle', async () => {
    const res = await get('/admin/assets/index-def456.js')

    expect(await res.text()).toBe('console.log(2)')
  })

  it('leaves a missing chunk as a 404 rather than serving HTML', async () => {
    const res = await get('/assets/gone.js', { headers: { accept: '*/*' } })

    expect(res.status).toBe(404)
    expect(await res.text()).not.toContain('<!doctype html>')
  })

  it('does not fall back for a non-GET', async () => {
    const res = await get('/bookings', { method: 'POST', headers: { accept: 'text/html' } })

    expect(res.status).toBe(404)
  })
})
