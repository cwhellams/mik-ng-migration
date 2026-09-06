/**
 * Everything this Worker reads from its environment.
 *
 * On workerd there is no `process.env`: bindings and vars arrive per request,
 * on the `env` argument to `fetch()`. That is why `context.ts` exists — the
 * 79 distinct `process.env.X` reads scattered through apps/backend cannot each
 * take an `env` parameter, so they read it from the ambient request context
 * instead.
 *
 * Names are kept identical to the backend's (`NODE_ENV`, not `ENVIRONMENT`) so
 * a ported module's `process.env.NODE_ENV` becomes `getEnv().NODE_ENV` and
 * nothing else about it changes.
 */
export interface Env {
  /**
   * Origin of the legacy Express backend. Everything not yet ported is proxied
   * there; see `proxy.ts`. It goes away with the last unported domain.
   */
  LEGACY_ORIGIN: string

  /**
   * Same three values the backend uses. 'test' makes the problem handler
   * disclose the underlying error message, exactly as it does today.
   */
  NODE_ENV?: string

  /**
   * 32 bytes as 64 hex characters, for the AES-256-GCM field encryption in
   * `lib/fieldEncryption.ts`. A secret, not a var: it decrypts every HETU in
   * the members table.
   */
  FIELD_ENCRYPTION_KEY?: string

  /** HS256 signing secrets for the access and refresh tokens. Secrets. */
  ACCESS_TOKEN_SECRET?: string
  REFRESH_TOKEN_SECRET?: string

  /** Token lifetimes, as durations ('15m', '7d'). */
  ACCESS_TOKEN_EXPIRATION?: string
  REFRESH_TOKEN_EXPIRATION?: string

  /**
   * Comma-separated path prefixes served by this Worker instead of being
   * proxied, overriding the compiled-in list in `config.ts`. This is the
   * rollback lever: emptying it sends every path back to the legacy backend
   * without a code change.
   */
  PORTED_PREFIXES?: string
}
