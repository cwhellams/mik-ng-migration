import type { Request, Response } from 'express'

/**
 * Naming and scoping for the httpOnly auth cookies.
 *
 * Two deployments of this backend answer on sibling hosts under one registrable
 * domain: production on intra.mik.fi / twr.mik.fi, test on beta.mik.fi /
 * beta-twr.mik.fi. #1233 shares one session across each pair by setting
 * COOKIE_DOMAIN='.mik.fi'.
 *
 * The narrowest domain covering intra.mik.fi *and* twr.mik.fi is mik.fi. The
 * narrowest covering beta.mik.fi and beta-twr.mik.fi is *also* mik.fi, because
 * 'beta-twr' is a sibling label of 'beta' and not a child of it — '.beta.mik.fi'
 * would not reach it. So both environments were writing a cookie named
 * 'accessToken' on domain '.mik.fi', path '/'.
 *
 * A cookie's identity is exactly (name, domain, path). Those were therefore not
 * two cookies but one, and whichever environment a member signed into last owned
 * it. The other then received a token signed with a secret it does not hold,
 * answered 401 to every request, and bounced the member back to the login
 * screen — where signing in stole the cookie back and broke the first one. That
 * is the login loop, and it is how signing into beta broke production without a
 * line of production code changing.
 *
 * Domain scoping cannot separate the two environments, so the *name* must:
 * COOKIE_PREFIX is set per environment ('intra_' / 'beta_'), and any deployment
 * that sets COOKIE_DOMAIN must set it. assertAuthCookieConfig() refuses to boot
 * otherwise, because the failure it prevents is silent, remote, and total.
 */

/** The unprefixed names used before COOKIE_PREFIX existed. Cleared, never read. */
const LEGACY_ACCESS_COOKIE = 'accessToken'
const LEGACY_REFRESH_COOKIE = 'refreshToken'

export const ACCESS_COOKIE_PATH = '/'
export const REFRESH_COOKIE_PATH = '/api/auth/refresh'

// All of these read process.env at call time rather than at module load: tests
// flip the values per case, and the startup guard must see the real environment
// rather than a snapshot taken before dotenv ran.
const cookiePrefix = (): string => process.env.COOKIE_PREFIX ?? ''

export const cookieDomain = (): string | undefined => process.env.COOKIE_DOMAIN || undefined

export const accessCookieName = (): string => `${cookiePrefix()}${LEGACY_ACCESS_COOKIE}`
export const refreshCookieName = (): string => `${cookiePrefix()}${LEGACY_REFRESH_COOKIE}`

export const readAccessToken = (req: Request): string | undefined =>
  req.cookies?.[accessCookieName()]

export const readRefreshToken = (req: Request): string | undefined =>
  req.cookies?.[refreshCookieName()]

export class AuthCookieConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthCookieConfigError'
  }
}

/**
 * Fail fast on the one misconfiguration that cannot be detected at runtime: a
 * cookie domain shared between environments without a name that separates them.
 * Refusing to start is the lesser harm — the alternative is a deployment that
 * boots cleanly and silently signs members out of the *other* environment.
 */
export const assertAuthCookieConfig = (): void => {
  if (cookieDomain() && !cookiePrefix()) {
    throw new AuthCookieConfigError(
      `COOKIE_DOMAIN='${cookieDomain()}' is set but COOKIE_PREFIX is not. ` +
        'Every deployment sharing that cookie domain would write the same ' +
        "(name, domain, path) cookie and overwrite the others' sessions. Set " +
        "COOKIE_PREFIX to a value unique per environment (e.g. 'intra_' in " +
        "production, 'beta_' in test).",
    )
  }
}

interface CookieScope {
  name: string
  path: string
  domain?: string
}

const baseCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
})

const sameScope = (a: CookieScope, b: CookieScope): boolean =>
  a.name === b.name && a.path === b.path && a.domain === b.domain

/**
 * Every (name, domain, path) triple this backend has ever stored an auth cookie
 * under: current and legacy names, host-only and domain-scoped.
 *
 * The host-only variants matter because they are what makes a stale cookie
 * *shadow* a fresh one rather than simply expire beside it. When two cookies
 * share a name, RFC 6265 §5.4 orders them by path length and then by creation
 * time, and `cookie-parser` keeps the first of a repeated name — so the oldest
 * leftover wins every read, no matter how many times the member signs in.
 */
const allAuthCookieScopes = (): CookieScope[] => {
  const domain = cookieDomain()
  const named: Array<[string, string]> = [
    [accessCookieName(), ACCESS_COOKIE_PATH],
    [refreshCookieName(), REFRESH_COOKIE_PATH],
    [LEGACY_ACCESS_COOKIE, ACCESS_COOKIE_PATH],
    [LEGACY_REFRESH_COOKIE, REFRESH_COOKIE_PATH],
  ]

  const scopes: CookieScope[] = []
  for (const [name, path] of named) {
    for (const scope of domain
      ? [
          { name, path },
          { name, path, domain },
        ]
      : [{ name, path }]) {
      // With COOKIE_PREFIX unset the legacy names *are* the current names, so
      // the same triple appears twice. Emitting it twice is harmless but noisy.
      if (!scopes.some((s) => sameScope(s, scope))) {
        scopes.push(scope)
      }
    }
  }
  return scopes
}

const clearScope = (res: Response, scope: CookieScope): void => {
  res.clearCookie(scope.name, {
    ...baseCookieOptions(),
    path: scope.path,
    ...(scope.domain ? { domain: scope.domain } : {}),
  })
}

/**
 * Delete every auth cookie this backend could have set, under every name and
 * scope. Used by logout — which previously cleared only the host-only variant
 * and so left the shared '.mik.fi' session alive, meaning signing out of either
 * app signed you out of neither.
 */
export const clearAuthCookies = (res: Response): void => {
  for (const scope of allAuthCookieScopes()) {
    clearScope(res, scope)
  }
}

/**
 * Set the access and refresh cookies, evicting every other variant first so a
 * leftover can never shadow what we just issued.
 */
export const setAuthCookies = (
  res: Response,
  tokens: { accessToken: string; refreshToken: string; refreshExpires: Date },
): void => {
  const domain = cookieDomain()
  const target: CookieScope[] = [
    { name: refreshCookieName(), path: REFRESH_COOKIE_PATH, ...(domain ? { domain } : {}) },
    { name: accessCookieName(), path: ACCESS_COOKIE_PATH, ...(domain ? { domain } : {}) },
  ]

  for (const scope of allAuthCookieScopes()) {
    if (!target.some((t) => sameScope(t, scope))) {
      clearScope(res, scope)
    }
  }

  res.cookie(refreshCookieName(), tokens.refreshToken, {
    ...baseCookieOptions(),
    expires: tokens.refreshExpires,
    path: REFRESH_COOKIE_PATH,
    ...(domain ? { domain } : {}),
  })
  res.cookie(accessCookieName(), tokens.accessToken, {
    ...baseCookieOptions(),
    path: ACCESS_COOKIE_PATH,
    ...(domain ? { domain } : {}),
  })
}
