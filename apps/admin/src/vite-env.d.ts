/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_API_TARGET: string
  /** Base URL of the member app. Derived from VITE_API_TARGET by default (see MemberAppLink's memberBase) — set this to override, e.g. for local dev. */
  readonly VITE_MEMBER_URL?: string
  /** Cloudflare Turnstile site key for the login form. Unset renders no widget — see @mik/ui's TurnstileWidget. */
  readonly VITE_TURNSTILE_SITE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
