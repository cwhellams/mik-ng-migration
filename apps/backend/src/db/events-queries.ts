import { db } from './connection.ts'
import type { JWTUser } from '../routes/auth/token.ts'
import type { ClubEvent, EventCreate, EventUpdate, EventFilters } from '../routes/events/models.ts'

const toEvent = (row: {
  event_id: string
  title: string
  description: string | null
  location: string | null
  start_time: Date
  end_time: Date
  is_public: boolean
  created_at: Date
  created_by: string
  updated_at: Date
  updated_by: string
}): ClubEvent => ({
  eventId: row.event_id,
  title: row.title,
  description: row.description,
  location: row.location,
  startTime: row.start_time.toISOString(),
  endTime: row.end_time.toISOString(),
  isPublic: row.is_public,
  createdAt: row.created_at.toISOString(),
  createdBy: row.created_by,
  updatedAt: row.updated_at.toISOString(),
  updatedBy: row.updated_by,
})

export const getAllEvents = async (filters: EventFilters = {}): Promise<ClubEvent[]> => {
  const { from, to, publicOnly = false, limit = 200, offset = 0 } = filters

  let query = db
    .selectFrom('member.events')
    .selectAll()
    .orderBy('start_time', 'asc')
    .limit(limit)
    .offset(offset)

  if (publicOnly) {
    query = query.where('is_public', '=', true)
  }

  if (from) {
    query = query.where('end_time', '>=', new Date(from))
  }

  if (to) {
    query = query.where('start_time', '<=', new Date(to))
  }

  const rows = await query.execute()
  return rows.map(toEvent)
}

export const getEventById = async (eventId: string): Promise<ClubEvent | undefined> => {
  const row = await db
    .selectFrom('member.events')
    .selectAll()
    .where('event_id', '=', eventId)
    .executeTakeFirst()

  return row ? toEvent(row) : undefined
}

export const createEvent = async (data: EventCreate, user: JWTUser): Promise<ClubEvent> => {
  const row = await db
    .insertInto('member.events')
    .values({
      title: data.title,
      description: data.description ?? null,
      location: data.location ?? null,
      start_time: new Date(data.startTime),
      end_time: new Date(data.endTime),
      is_public: data.isPublic ?? false,
      created_by: user.memberId,
      updated_by: user.memberId,
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  return toEvent(row)
}

export const updateEvent = async (
  eventId: string,
  data: EventUpdate,
  user: JWTUser,
): Promise<ClubEvent | undefined> => {
  const updates: Record<string, unknown> = {
    updated_at: new Date(),
    updated_by: user.memberId,
  }

  if (data.title !== undefined) updates.title = data.title
  if (data.description !== undefined) updates.description = data.description
  if (data.location !== undefined) updates.location = data.location
  if (data.startTime !== undefined) updates.start_time = new Date(data.startTime)
  if (data.endTime !== undefined) updates.end_time = new Date(data.endTime)
  if (data.isPublic !== undefined) updates.is_public = data.isPublic

  const row = await db
    .updateTable('member.events')
    .set(updates)
    .where('event_id', '=', eventId)
    .returningAll()
    .executeTakeFirst()

  return row ? toEvent(row) : undefined
}

export const deleteEvent = async (eventId: string): Promise<boolean> => {
  const result = await db
    .deleteFrom('member.events')
    .where('event_id', '=', eventId)
    .executeTakeFirst()

  return (result.numDeletedRows ?? BigInt(0)) > BigInt(0)
}
