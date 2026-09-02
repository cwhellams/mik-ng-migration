/**
 * The SWR cache is keyed on `[url, params]` and nothing else — it has no notion
 * of *who* asked. Every entry in it is therefore an answer given to one session,
 * and a sign-in replaces that session: at best the entries are stale, at worst
 * one of them is a 401 from before the member signed in.
 *
 * That last case is #1312. Verifying an emailed login code sets a valid cookie
 * and navigates into the app, where the header's `useRoles` found the 401 its
 * own earlier, logged-out call had left in the cache and bounced the member
 * straight back to the login screen. `useApi` no longer redirects on a cached
 * 401 (see the comment beside its redirect), but the cache is where the wrong
 * answer came from, and emptying it at the one moment it is known to be invalid
 * is what saves the rest of the app from reasoning about it: `useRoles` and
 * `useMe` both skip stale revalidation deliberately, so a page reached this way
 * would otherwise render permission-less for a beat before the refetch landed.
 *
 * Signing *out* is deliberately not one of those moments. The tab is still
 * showing a page full of the outgoing member's data at that point, and pulling
 * every value out from under it buys nothing the next sign-in's clear does not
 * already cover. The member app's user menu drops the one key that matters
 * there — `me`, so the header switches to the Login button immediately — and
 * leaves the rest to be replaced or discarded with the page.
 */
import { useCallback } from 'react'
import { useSWRConfig } from 'swr'

/**
 * The `auth/*` endpoints that sign a member in.
 *
 * `login` and `register` are not among them: both only send an email, and the
 * member is still whoever they were until the token in that email is verified
 * — which is `login/validate` (the link) or `login/verify-code` (the code)
 * for a sign-in, and `register/verify` for a new member's first one. `contact`
 * is not an auth call at all.
 *
 * A passkey login has no entry here because it never goes through `useAuth`;
 * `Login.tsx` clears the cache for it directly.
 */
const SIGN_IN_ENDPOINTS: readonly string[] = [
  'login/validate',
  'login/verify-code',
  'register/verify',
]

/** True for an `auth/*` endpoint whose success starts a new session. */
export const signsIn = (endpoint: string): boolean => SIGN_IN_ENDPOINTS.includes(endpoint)

/**
 * Empties the whole SWR cache — data and cached errors alike — without
 * refetching anything.
 *
 * `revalidate: false` matters: the caller is on its way somewhere else, and the
 * pages that mount next fetch what they need for themselves. Revalidating here
 * would fire every key the outgoing session had touched, several of them from
 * components that no longer exist.
 */
export const useClearApiCache = (): (() => Promise<void>) => {
  const { mutate } = useSWRConfig()

  return useCallback(async () => {
    await mutate(() => true, undefined, { revalidate: false })
  }, [mutate])
}
