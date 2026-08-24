/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_API_TARGET: string
  /** Base URL of the admin app. Defaults to '/atc' — set this only in local dev. */
  readonly VITE_ADMIN_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
