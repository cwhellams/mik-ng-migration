import 'dotenv/config'

import { afterEach, describe, expect, it } from '@jest/globals'

import { db } from '../../src/db/connection.ts'
import {
  createSession,
  getActiveSessionsForMember,
  getSessionById,
  revokeOtherSessions,
  revokeSession,
  touchSession,
} from '../../src/db/session-queries.ts'

/**
 * These run against the real database because the whole point of the module is
 * the `revoked_at IS NULL` guard on three different statements — the thing that
 * makes revocation stick, makes it idempotent, and keeps it inside one member's
 * rows. Mocking Kysely would assert that the query builder was called, not that
 * Postgres agreed.
 *
 * The two members here are deliberately NOT Matti1 or Liisa1. V440 seeds those
 * two with demo sessions, and `revokeOtherSessions(member, null, …)` revokes
 * every active row a member has — run against Matti1 it would quietly and
 * permanently revoke the seed data, so the next `pnpm dev` would show an empty
 * card until someone re-baselined. Anna1 and Juha1 own no seeded sessions, and
 * every row these tests create is deleted again afterwards.
 */
const MEMBER = 'Anna1'
const OTHER_MEMBER = 'Juha1'
describe('session-queries', () => {
  const created: string[] = []

  const newSession = async (memberId: string, ip = '10.1.2.3', ua = 'jest') => {
    const id = await createSession(memberId, ip, ua)
    created.push(id)
    return id
  }

  afterEach(async () => {
    if (created.length > 0) {
      await db.deleteFrom('member.sessions').where('id', 'in', created).execute()
      created.length = 0
    }
  })

  it('creates a session that is immediately active and readable back', async () => {
    const id = await newSession(MEMBER, '192.0.2.10', 'jest/ua')

    const row = await getSessionById(id)
    expect(row).toMatchObject({
      id,
      memberId: MEMBER,
      ipAddress: '192.0.2.10',
      userAgent: 'jest/ua',
    })

    const active = await getActiveSessionsForMember(MEMBER)
    expect(active.map((s) => s.id)).toContain(id)
  })

  it('stores a null ip and user agent rather than the string "undefined"', async () => {
    // createSession directly, not the newSession helper: its defaults would
    // supply the very values this is about not being supplied.
    const id = await createSession(MEMBER, undefined, undefined)
    created.push(id)

    expect(await getSessionById(id)).toMatchObject({ ipAddress: null, userAgent: null })
  })

  it('creates a session whose last use is not ahead of its creation', async () => {
    // The two columns are TIMESTAMP without a zone, and are written by different
    // clocks unless createSession writes both itself -- the column default is
    // the database session's, a JS Date is the Node process's. Where those
    // differ, "Last active" rendered hours ahead of "Signed in".
    const id = await newSession(MEMBER)

    const row = (await getSessionById(id))!
    expect(new Date(row.lastUsedAt).getTime()).toBe(new Date(row.createdAt).getTime())
  })

  it('orders the active list by last use, most recent first', async () => {
    const older = await newSession(MEMBER)
    const newer = await newSession(MEMBER)

    // createSession defaults both timestamps to now(), so nudge them apart
    // rather than depending on insert order surviving the ORDER BY.
    await db
      .updateTable('member.sessions')
      .set({ lastUsedAt: new Date(Date.now() - 60 * 60 * 1000) })
      .where('id', '=', older)
      .execute()

    const active = await getActiveSessionsForMember(MEMBER)
    const ids = active.map((s) => s.id)
    expect(ids.indexOf(newer)).toBeLessThan(ids.indexOf(older))
  })

  it('touchSession bumps last_used_at and reports the session is live', async () => {
    const id = await newSession(MEMBER)
    await db
      .updateTable('member.sessions')
      .set({ lastUsedAt: new Date(Date.now() - 60 * 60 * 1000) })
      .where('id', '=', id)
      .execute()
    const before = (await getSessionById(id))!.lastUsedAt

    expect(await touchSession(id)).toBe(true)

    const after = (await getSessionById(id))!.lastUsedAt
    expect(new Date(after).getTime()).toBeGreaterThan(new Date(before).getTime())
  })

  it('touchSession leaves the recorded ip and user agent at their creation values', async () => {
    const id = await newSession(MEMBER, '198.51.100.7', 'original-ua')

    await touchSession(id)

    expect(await getSessionById(id)).toMatchObject({
      ipAddress: '198.51.100.7',
      userAgent: 'original-ua',
    })
  })

  it('touchSession returns false for a revoked session — this is what /refresh turns into a 401', async () => {
    const id = await newSession(MEMBER)
    await revokeSession(id, 'user_terminated')

    expect(await touchSession(id)).toBe(false)
  })

  it('touchSession returns false for an id that matches no row', async () => {
    expect(await touchSession('00000000-0000-0000-0000-000000000000')).toBe(false)
  })

  it('revokeSession removes the row from the active list and records the reason', async () => {
    const id = await newSession(MEMBER)

    expect(await revokeSession(id, 'admin_terminated')).toBe(true)

    const active = await getActiveSessionsForMember(MEMBER)
    expect(active.map((s) => s.id)).not.toContain(id)

    const row = await db
      .selectFrom('member.sessions')
      .select(['revokedReason', 'revokedAt'])
      .where('id', '=', id)
      .executeTakeFirstOrThrow()
    expect(row.revokedReason).toBe('admin_terminated')
    expect(row.revokedAt).not.toBeNull()
  })

  it('revokeSession is idempotent and does not rewrite the original reason', async () => {
    const id = await newSession(MEMBER)
    await revokeSession(id, 'logout')

    expect(await revokeSession(id, 'admin_terminated')).toBe(false)

    const row = await db
      .selectFrom('member.sessions')
      .select('revokedReason')
      .where('id', '=', id)
      .executeTakeFirstOrThrow()
    expect(row.revokedReason).toBe('logout')
  })

  it('getSessionById still finds a revoked session, so DELETE can tell 404 from "not yours"', async () => {
    const id = await newSession(MEMBER)
    await revokeSession(id, 'logout')

    expect(await getSessionById(id)).toMatchObject({ id, memberId: MEMBER })
  })

  it('revokeOtherSessions spares the current session and counts the rest', async () => {
    const current = await newSession(MEMBER)
    const other1 = await newSession(MEMBER)
    const other2 = await newSession(MEMBER)
    const activeBefore = await getActiveSessionsForMember(MEMBER)

    const revoked = await revokeOtherSessions(MEMBER, current, 'bulk_logout_others')

    expect(revoked).toBe(activeBefore.length - 1)
    const activeAfter = await getActiveSessionsForMember(MEMBER)
    expect(activeAfter.map((s) => s.id)).toEqual([current])
    expect(activeAfter.map((s) => s.id)).not.toContain(other1)
    expect(activeAfter.map((s) => s.id)).not.toContain(other2)
  })

  it('revokeOtherSessions with no current session revokes every one of them — the admin case', async () => {
    await newSession(MEMBER)
    await newSession(MEMBER)

    await revokeOtherSessions(MEMBER, null, 'bulk_logout_others')

    expect(await getActiveSessionsForMember(MEMBER)).toEqual([])
  })

  it('revokeOtherSessions never reaches another member', async () => {
    const ours = await newSession(MEMBER)
    const theirs = await newSession(OTHER_MEMBER)

    await revokeOtherSessions(MEMBER, null, 'bulk_logout_others')

    expect((await getActiveSessionsForMember(OTHER_MEMBER)).map((s) => s.id)).toContain(theirs)
    expect((await getActiveSessionsForMember(MEMBER)).map((s) => s.id)).not.toContain(ours)
  })
})
