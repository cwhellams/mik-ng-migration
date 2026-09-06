/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_API_TARGET: string
  /** Base URL of the admin app. Derived from VITE_API_TARGET by default (see AdminAppRedirect's adminBase) — set this to override, e.g. for local dev, or to '/admin' when both apps share one origin. */
  readonly VITE_ADMIN_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
