import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import worker from './index'

const LEGACY = 'https://legacy.example.test'

let origin: ReturnType<typeof vi.fn>

beforeEach(() => {
  // The Worker under test runs in this isolate, so a global stub reaches its
  // subrequests. Anything it fetches that a test did not arrange shows up as an
  // assertion on this mock rather than as a real network call.
  origin = vi.fn(async () => new Response('from the legacy backend', { status: 200 }))
  vi.stubGlobal('fetch', origin)
})

afterEach(() => vi.unstubAllGlobals())

const get = async (path: string, init?: RequestInit) => {
  const ctx = createExecutionContext()
  const res = await worker.fetch(new Request(`https://intra.example.test${path}`, init), env, ctx)
  await waitOnExecutionContext(ctx)
  return res
}

describe('a ported domain', () => {
  it('is answered by this Worker', async () => {
    const res = await get('/api/v1/time')
    const body = (await res.json()) as { utcIso: string; epochMs: number }

    expect(res.status).toBe(200)
    expect(Date.parse(body.utcIso)).toBe(body.epochMs)
    expect(origin).not.toHaveBeenCalled()
  })

  it('carries the headers the Express backend sets today', async () => {
    const res = await get('/api/v1/time')

    // helmet@8.3.0's defaults, as configured in apps/backend/src/app.ts.
    expect(res.headers.get('cross-origin-opener-policy')).toBe('same-origin')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN')
    expect(res.headers.get('referrer-policy')).toBe('no-referrer')
    expect(res.headers.get('x-xss-protection')).toBe('0')
    expect(res.headers.get('permissions-policy')).toContain('geolocation=()')
  })

  it('supplies a CSP only when the request did not come through Cloudflare', async () => {
    const direct = await get('/api/v1/time')
    expect(direct.headers.get('content-security-policy')).toContain("default-src 'self'")

    // Cloudflare stamps CF-Ray on everything it proxies, and the edge rule
    // supplies the CSP for those. Sending one here too would be a duplicate.
    const viaCloudflare = await get('/api/v1/time', { headers: { 'cf-ray': 'abc-HEL' } })
    expect(viaCloudflare.headers.get('content-security-policy')).toBeNull()
  })

  it('answers an unknown route inside it with a problem, not the legacy backend', async () => {
    // A gap inside a domain claimed as ported is a porting bug. Proxying it
    // would hide that behind a response that looks like it worked.
    const res = await get('/api/v1/time/nope')

    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toContain('application/problem+json')
    expect(await res.json()).toMatchObject({ status: 404, instance: '/api/v1/time/nope' })
    expect(origin).not.toHaveBeenCalled()
  })
})

describe('the strangler facade', () => {
  it('proxies an unported path with its method, query and cookies intact', async () => {
    const res = await get('/api/v1/members?page=2', {
      method: 'POST',
      headers: { cookie: 'intra_accessToken=abc', 'x-sudo': 'true' },
    })

    expect(await res.text()).toBe('from the legacy backend')
    const [proxied, init] = origin.mock.calls[0] as [Request, RequestInit]
    expect(proxied.url).toBe(`${LEGACY}/api/v1/members?page=2`)
    expect(proxied.method).toBe('POST')
    expect(proxied.headers.get('cookie')).toBe('intra_accessToken=abc')
    expect(proxied.headers.get('x-sudo')).toBe('true')
    expect(proxied.headers.get('x-forwarded-host')).toBe('intra.example.test')
    expect(init.redirect).toBe('manual')
  })

  it('leaves a proxied response exactly as the legacy backend sent it', async () => {
    // The legacy backend still runs helmet and still owns its own error format.
    // Stamping this Worker's headers on top would at best duplicate them, and
    // in the CSP's case would send two.
    origin.mockResolvedValue(new Response('body', { headers: { 'x-frame-options': 'DENY' } }))

    const res = await get('/api/v1/members')

    expect(res.headers.get('x-frame-options')).toBe('DENY')
    expect(res.headers.get('permissions-policy')).toBeNull()
  })

  it('hands a tiny-URL redirect back unfollowed', async () => {
    origin.mockResolvedValue(
      new Response(null, { status: 302, headers: { location: 'https://storage/f.pdf' } }),
    )

    const res = await get('/t/2cQ3')

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://storage/f.pdf')
  })

  it('sends a ported path to the legacy backend when the rollback lever is pulled', async () => {
    // PORTED_PREFIXES='' has to mean "nothing is ported", which is the whole
    // point of the lever: rolling a domain back must not need a deploy.
    const ctx = createExecutionContext()
    await worker.fetch(
      new Request('https://intra.example.test/api/v1/time'),
      { ...env, PORTED_PREFIXES: '' },
      ctx,
    )
    await waitOnExecutionContext(ctx)

    expect(origin).toHaveBeenCalledOnce()
  })
})
