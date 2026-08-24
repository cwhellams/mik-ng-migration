import type { AxiosInstance } from 'axios'

/**
 * The axios instance the shared API modules (`dtoApi`, `examApi`) issue their
 * requests through, supplied by whichever app is running.
 *
 * The two apps' clients are deliberately *not* the same object: `apps/admin`
 * sends `x-sudo: true` on every request, `apps/frontend` follows its sudo
 * toggle, and each redirects a dead session to its own login route. Those
 * differences belong to the apps. What does not is the ~400 lines of endpoint
 * definitions layered on top, which is identical in both and is what lives
 * here.
 *
 * So the client is injected rather than imported: each app calls
 * `setHttpClient(sharedApi)` once at startup (see its `main.tsx`). This is a
 * module-level singleton, but `sharedApi` already was one — the coupling is
 * relocated, not introduced.
 */
let client: AxiosInstance | undefined

export const setHttpClient = (instance: AxiosInstance): void => {
  client = instance
}

/** Resets the registry. Test-only — apps set the client once and never clear it. */
export const resetHttpClient = (): void => {
  client = undefined
}

export const http = (): AxiosInstance => {
  if (!client) {
    throw new Error(
      'No HTTP client registered. Call setHttpClient(sharedApi) from the app entry point before using @mik/ui/api/*.',
    )
  }
  return client
}
