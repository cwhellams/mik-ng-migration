/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_API_TARGET: string
  /** Base URL of the member app. Defaults to '' (same host) — set this only in local dev. */
  readonly VITE_MEMBER_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
