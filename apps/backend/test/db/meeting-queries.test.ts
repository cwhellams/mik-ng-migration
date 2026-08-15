import 'dotenv/config'

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals'

import { db } from '../../src/db/connection.ts'
import { getMeetingAttendees, getVoteCounters } from '../../src/db/meeting-queries.ts'

/**
 * These two are the only meeting queries built from raw `sql` rather than the query
 * builder, and the route tests mock both — so nothing executed them against a real
 * database. The camelDb migration (issue #1115, phase 5) rewrote the column names
 * *inside* the SQL text to camelCase, which Postgres rejects outright
 * ("column r.firstname does not exist"), and the whole suite stayed green.
 *
 * Raw SQL text is never touched by the identifier transformer, so it must keep the
 * real snake_case column names. Only the result keys are camelCased, which is why the
 * mappers read row.firstName. These tests are what makes that difference observable.
 */
describe('meeting-queries raw SQL', () => {
  const memberId = 'Matti1'
  let meetingId: string

  beforeAll(async () => {
    const meeting = await db
      .insertInto('member.meeting')
      .values({ title: 'raw sql fixture', status: 'DRAFT' })
      .returning('meeting_id')
      .executeTakeFirstOrThrow()
    meetingId = meeting.meeting_id

    await db
      .insertInto('member.meeting_attendance')
      .values({ meeting_id: meetingId, member_id: memberId, joined_at: new Date() })
      .execute()
    await db
      .insertInto('member.meeting_vote_counter')
      .values({ meeting_id: meetingId, member_id: memberId, assigned_at: new Date() })
      .execute()
  })

  afterAll(async () => {
    await db.deleteFrom('member.meeting_vote_counter').where('meeting_id', '=', meetingId).execute()
    await db.deleteFrom('member.meeting_attendance').where('meeting_id', '=', meetingId).execute()
    await db.deleteFrom('member.meeting').where('meeting_id', '=', meetingId).execute()
  })

  it('reads attendees, with the joined member name mapped to camelCase', async () => {
    const attendees = await getMeetingAttendees(meetingId)

    expect(attendees).toHaveLength(1)
    expect(attendees[0].memberId).toBe(memberId)
    // The join supplies these; they are undefined if the result keys are not mapped.
    expect(attendees[0].firstName).toBeTruthy()
    expect(attendees[0].lastName).toBeTruthy()
  })

  it('reads vote counters the same way', async () => {
    const counters = await getVoteCounters(meetingId)

    expect(counters).toHaveLength(1)
    expect(counters[0].memberId).toBe(memberId)
    expect(counters[0].firstName).toBeTruthy()
  })
})
