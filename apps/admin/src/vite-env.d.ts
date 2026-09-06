/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_API_TARGET: string
  /** Base URL of the member app. Derived from VITE_API_TARGET by default (see MemberAppLink's memberBase) — set this to override, e.g. for local dev, or to '/' when both apps share one origin. */
  readonly VITE_MEMBER_URL?: string
  /** Where this bundle is mounted: '/' on its own subdomain (the default), '/admin/' when served as a path on the member app's origin. Read back as import.meta.env.BASE_URL. */
  readonly VITE_BASE_PATH?: string
  /** Cloudflare Turnstile site key for the login form. Unset renders no widget — see @mik/ui's TurnstileWidget. */
  readonly VITE_TURNSTILE_SITE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
