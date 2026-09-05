import { isOriginPath, spaFallbackFor } from './routing'

export interface Env {
  /** Static Assets binding holding the built SPA bundle. */
  ASSETS: Fetcher
  /**
   * Origin for everything the API owns. During the strangler migration this is
   * the DigitalOcean Express backend; it becomes a service binding to the API
   * Worker as domains move across, and the variable disappears with the last one.
   */
  LEGACY_ORIGIN: string
}

/**
 * Forward a request to the API origin unchanged.
 *
 * `redirect: 'manual'` is load-bearing: /t/:code answers 302 to a presigned
 * storage URL, and following it here would stream the file through the Worker
 * and hand the browser a 200 for a URL it never navigated to.
 */
async function proxyToOrigin(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const target = new URL(url.pathname + url.search, env.LEGACY_ORIGIN)

  const proxied = new Request(target, request)
  // The Host header is rewritten to the origin's, so the browser-facing
  // hostname has to travel separately. Nothing reads these yet; once tenants
  // are resolved by hostname (plan phase 7) this is how the origin learns which
  // one it is serving.
  proxied.headers.set('X-Forwarded-Host', url.host)
  proxied.headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''))

  return fetch(proxied, { redirect: 'manual' })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (isOriginPath(url.pathname)) return proxyToOrigin(request, env)

    // With `not_found_handling: "none"` a matching asset is served by the asset
    // server without invoking this Worker at all, so in production this call
    // usually only runs for misses. Asking anyway keeps one code path, and
    // keeps the Worker correct if `run_worker_first` is ever turned on.
    const asset = await env.ASSETS.fetch(request)
    if (asset.status !== 404) return asset

    const index = spaFallbackFor(request)
    if (!index) return asset

    const fallback = await env.ASSETS.fetch(new Request(new URL(index, url), request))
    // The asset server answers 200 for index.html; the browser is being handed
    // it in place of a URL that does not exist as a file, which is a 200 for the
    // SPA route, not for the asset. Preserve the body and headers, keep the 200.
    return new Response(fallback.body, fallback)
  },
} satisfies ExportedHandler<Env>
