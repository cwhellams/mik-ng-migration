import { z } from 'zod'

/**
 * A session id, as it appears in a URL path.
 *
 * `member.sessions.id` is a UUID column, so an id that is not one is not merely
 * "not found" -- Postgres raises `invalid input syntax for type uuid` on the
 * comparison and the request becomes a 500. Checking the shape first turns that
 * into the 404 the caller deserves. The reaction lives in the backend route, not
 * here: this package must not know about Express.
 */
export const SessionIdSchema = z.string().guid()

/**
 * An active login session (#1234).
 *
 * One row of `member.sessions`, as the sessions card renders it. Authentication
 * is otherwise stateless -- these rows exist so a member can see which devices
 * they are signed in on and end one they do not recognise.
 *
 * `device` is derived from `userAgent` at serialization time rather than stored,
 * so improving the parser retroactively improves old rows and the raw header
 * stays available for support. Both `ipAddress` and `userAgent` are nullable
 * because a proxy or an API client can supply neither.
 */
export const SessionSchema = z.object({
  // The `member.sessions.id` primary key, and the `:sessionId` path segment the
  // terminate route takes -- so it is stated here exactly as SessionIdSchema
  // above states it, rather than as a bare string that would let a malformed id
  // reach a route that cannot look it up.
  id: SessionIdSchema,
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  /** Friendly label parsed from `userAgent`, e.g. 'Chrome on Windows'. */
  device: z.string(),
  // ISO 8601, always: session-queries.ts maps both columns through
  // `new Date(...).toISOString()`. Saying so keeps a non-datetime string from
  // reaching the card's date formatting, where it renders as "Invalid Date"
  // rather than as an error anyone can trace back here.
  createdAt: z.string().datetime(),
  lastUsedAt: z.string().datetime(),
  /**
   * True for the session the *requester* is currently using -- never for a row
   * an admin is looking at on somebody else's profile. The one row that may not
   * be terminated through DELETE; `/logout` is the path that ends it.
   */
  isCurrent: z.boolean(),
})

export type Session = z.infer<typeof SessionSchema>

export const SessionListResponseSchema = z.object({
  sessions: z.array(SessionSchema),
})

export type SessionListResponse = z.infer<typeof SessionListResponseSchema>

export const RevokeOthersResponseSchema = z.object({
  ok: z.literal(true),
  revokedCount: z.number(),
})

export type RevokeOthersResponse = z.infer<typeof RevokeOthersResponseSchema>

/**
 * Why a session row stopped being active. Stored in `revoked_reason`, which is
 * VARCHAR(30) -- keep new values inside that.
 */
export const SESSION_REVOKE_REASONS = [
  'logout',
  'user_terminated',
  'admin_terminated',
  'bulk_logout_others',
] as const

export type SessionRevokeReason = (typeof SESSION_REVOKE_REASONS)[number]
