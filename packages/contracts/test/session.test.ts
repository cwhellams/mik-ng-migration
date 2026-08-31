import { describe, expect, it } from 'vitest'

import {
  RevokeOthersResponseSchema,
  SessionIdSchema,
  SessionListResponseSchema,
  SessionSchema,
} from '../src/session.ts'

/**
 * The sessions contract (#1234) is mostly plain fields, so what is worth
 * asserting is the two that are *not* plain strings.
 *
 * `id` is a UUID because it is the `member.sessions` primary key and the
 * `:sessionId` path segment; the timestamps are ISO 8601 because
 * session-queries.ts maps both columns through `toISOString()`. Stated loosely,
 * a malformed id reaches a route that cannot look it up and a malformed
 * timestamp renders as "Invalid Date" on the card with nothing to trace it to.
 */
const aSession = (overrides: Record<string, unknown> = {}) => ({
  id: '2ec94d3d-2c97-4036-9d48-14cd6fa8980d',
  ipAddress: '192.0.2.1',
  userAgent: 'Mozilla/5.0',
  device: 'Chrome on Windows',
  createdAt: '2026-08-28T23:06:42.498Z',
  lastUsedAt: '2026-08-28T23:07:13.876Z',
  isCurrent: true,
  ...overrides,
})

describe('SessionSchema', () => {
  it('accepts a row shaped the way the backend serialises one', () => {
    expect(SessionSchema.parse(aSession())).toEqual(aSession())
  })

  it('accepts the null ip and user agent a proxy or API client leaves behind', () => {
    const parsed = SessionSchema.parse(aSession({ ipAddress: null, userAgent: null }))

    expect(parsed.ipAddress).toBeNull()
    expect(parsed.userAgent).toBeNull()
  })

  it.each([
    ['not a uuid at all', 'session-1'],
    ['an empty id', ''],
    ['a truncated uuid', '2ec94d3d-2c97-4036-9d48'],
  ])('rejects %s', (_name, id) => {
    expect(SessionSchema.safeParse(aSession({ id })).success).toBe(false)
  })

  it.each(['createdAt', 'lastUsedAt'])('rejects a non-datetime %s', (field) => {
    // A bare date is the plausible mistake: it is what a TIMESTAMP column
    // stringifies to if a mapper ever stops calling toISOString().
    expect(SessionSchema.safeParse(aSession({ [field]: '2026-08-28' })).success).toBe(false)
  })

  it('rejects a timestamp that is a valid date but not a serialised one', () => {
    expect(SessionSchema.safeParse(aSession({ lastUsedAt: '28.08.2026 23:07' })).success).toBe(
      false,
    )
  })
})

describe('SessionIdSchema', () => {
  it('is the same rule SessionSchema applies to a row id', () => {
    expect(SessionIdSchema.safeParse('2ec94d3d-2c97-4036-9d48-14cd6fa8980d').success).toBe(true)
    expect(SessionIdSchema.safeParse('not-a-uuid').success).toBe(false)
  })
})

describe('SessionListResponseSchema', () => {
  it('accepts an empty list — a member with no other active session', () => {
    expect(SessionListResponseSchema.parse({ sessions: [] })).toEqual({ sessions: [] })
  })

  it('rejects a list whose rows are malformed rather than passing them through', () => {
    expect(
      SessionListResponseSchema.safeParse({ sessions: [aSession({ id: 'nope' })] }).success,
    ).toBe(false)
  })
})

describe('RevokeOthersResponseSchema', () => {
  it('accepts the bulk-revoke result', () => {
    expect(RevokeOthersResponseSchema.parse({ ok: true, revokedCount: 3 })).toEqual({
      ok: true,
      revokedCount: 3,
    })
  })

  it('rejects ok: false — the route never answers that, it problems instead', () => {
    expect(RevokeOthersResponseSchema.safeParse({ ok: false, revokedCount: 0 }).success).toBe(false)
  })
})
