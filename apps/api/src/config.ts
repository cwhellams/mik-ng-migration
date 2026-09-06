import { getEnv } from './context'

/**
 * Path prefixes this Worker serves itself. Everything else is proxied to the
 * legacy backend by `proxy.ts`.
 *
 * The unit is a domain, not a route. A domain is either live on Workers or it
 * is not, so that cutting over and rolling back are the same one-line change —
 * which is the whole reason the strangler facade exists. Serving half a domain
 * from each backend is the state this list is designed to make impossible.
 */
const PORTED_PREFIXES = ['/api/v1/time']

/**
 * The rollback lever. `PORTED_PREFIXES` in the environment replaces the list
 * above wholesale, so an empty string sends every path back to the legacy
 * backend without a deploy.
 */
export const portedPrefixes = (): string[] => {
  const override = getEnv().PORTED_PREFIXES
  if (override === undefined) return PORTED_PREFIXES
  return override
    .split(',')
    .map((prefix) => prefix.trim())
    .filter((prefix) => prefix.length > 0)
}

/** Whether this Worker owns `pathname`, rather than the legacy backend. */
export const isPorted = (pathname: string): boolean =>
  portedPrefixes().some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
