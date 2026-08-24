/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_API_TARGET: string
  /** Base URL of the member app. Derived from VITE_API_TARGET by default (see MemberAppLink's memberBase) — set this to override, e.g. for local dev. */
  readonly VITE_MEMBER_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
