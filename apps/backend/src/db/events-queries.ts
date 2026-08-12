import { db } from './connection.ts'
import type { JWTUser } from '../routes/auth/token.ts'
import type {
  ClubEvent,
  EventCreate,
  EventUpdate,
  EventFilters,
  EventTranslations,
} from '@mik/contracts/events'

type EventRow = {
  event_id: string
  title: string
  description: string | null
  location: string | null
  image_url: string | null
  performer: string | null
  start_time: Date
  end_time: Date
  is_public: boolean
  created_at: Date
  created_by: string
  updated_at: Date
  updated_by: string
}

const isTranslationLanguage = (language: string): language is keyof EventTranslations =>
  language === 'fi' || language === 'sv'

const getTranslationsByEventId = async (
  eventIds: string[],
): Promise<Map<string, EventTranslations>> => {
  const map = new Map<string, EventTranslations>()
  if (eventIds.length === 0) return map

  const rows = await db
    .selectFrom('member.event_translations')
    .select(['event_id', 'language', 'title', 'description'])
    .where('event_id', 'in', eventIds)
    .execute()

  for (const row of rows) {
    if (!isTranslationLanguage(row.language)) continue
    const translations = map.get(row.event_id) ?? {}
    translations[row.language] = { title: row.title, description: row.description }
    map.set(row.event_id, translations)
  }

  return map
}

const toEvent = (row: EventRow, translations: EventTranslations = {}): ClubEvent => ({
  eventId: row.event_id,
  title: row.title,
  description: row.description,
  location: row.location,
  imageUrl: row.image_url,
  performer: row.performer,
  translations,
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
  const translationsByEventId = await getTranslationsByEventId(rows.map((row) => row.event_id))
  return rows.map((row) => toEvent(row, translationsByEventId.get(row.event_id)))
}

export const getEventById = async (eventId: string): Promise<ClubEvent | undefined> => {
  const row = await db
    .selectFrom('member.events')
    .selectAll()
    .where('event_id', '=', eventId)
    .executeTakeFirst()

  if (!row) return undefined

  const translationsByEventId = await getTranslationsByEventId([eventId])
  return toEvent(row, translationsByEventId.get(eventId))
}

export const getEventImageKey = async (eventId: string): Promise<string | null | undefined> => {
  const row = await db
    .selectFrom('member.events')
    .select('image_key')
    .where('event_id', '=', eventId)
    .executeTakeFirst()

  return row?.image_key
}

export const setEventImage = async (
  eventId: string,
  imageUrl: string,
  imageKey: string,
): Promise<ClubEvent | undefined> => {
  const row = await db
    .updateTable('member.events')
    .set({ image_url: imageUrl, image_key: imageKey, updated_at: new Date() })
    .where('event_id', '=', eventId)
    .returningAll()
    .executeTakeFirst()

  if (!row) return undefined
  const translationsByEventId = await getTranslationsByEventId([eventId])
  return toEvent(row, translationsByEventId.get(eventId))
}

export const clearEventImage = async (eventId: string): Promise<ClubEvent | undefined> => {
  const row = await db
    .updateTable('member.events')
    .set({ image_url: null, image_key: null, updated_at: new Date() })
    .where('event_id', '=', eventId)
    .returningAll()
    .executeTakeFirst()

  if (!row) return undefined
  const translationsByEventId = await getTranslationsByEventId([eventId])
  return toEvent(row, translationsByEventId.get(eventId))
}

const upsertEventTranslation = async (
  eventId: string,
  language: 'fi' | 'sv',
  title: string,
  description: string | null,
): Promise<void> => {
  await db
    .insertInto('member.event_translations')
    .values({ event_id: eventId, language, title, description })
    .onConflict((oc) => oc.columns(['event_id', 'language']).doUpdateSet({ title, description }))
    .execute()
}

const deleteEventTranslation = async (eventId: string, language: 'fi' | 'sv'): Promise<void> => {
  await db
    .deleteFrom('member.event_translations')
    .where('event_id', '=', eventId)
    .where('language', '=', language)
    .execute()
}

const applyTranslations = async (
  eventId: string,
  translations: EventCreate['translations'] | EventUpdate['translations'],
): Promise<void> => {
  if (!translations) return

  for (const language of ['fi', 'sv'] as const) {
    const translation = translations[language]
    if (translation === undefined) continue
    if (translation === null) {
      await deleteEventTranslation(eventId, language)
    } else {
      await upsertEventTranslation(
        eventId,
        language,
        translation.title,
        translation.description ?? null,
      )
    }
  }
}

export const createEvent = async (data: EventCreate, user: JWTUser): Promise<ClubEvent> => {
  const row = await db
    .insertInto('member.events')
    .values({
      title: data.title,
      description: data.description ?? null,
      location: data.location ?? null,
      performer: data.performer ?? null,
      start_time: new Date(data.startTime),
      end_time: new Date(data.endTime),
      is_public: data.isPublic ?? false,
      created_by: user.memberId,
      updated_by: user.memberId,
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  await applyTranslations(row.event_id, data.translations)

  return getEventById(row.event_id) as Promise<ClubEvent>
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
  if (data.performer !== undefined) updates.performer = data.performer
  if (data.startTime !== undefined) updates.start_time = new Date(data.startTime)
  if (data.endTime !== undefined) updates.end_time = new Date(data.endTime)
  if (data.isPublic !== undefined) updates.is_public = data.isPublic

  const row = await db
    .updateTable('member.events')
    .set(updates)
    .where('event_id', '=', eventId)
    .returningAll()
    .executeTakeFirst()

  if (!row) return undefined

  await applyTranslations(eventId, data.translations)

  return getEventById(eventId)
}

export const deleteEvent = async (eventId: string): Promise<boolean> => {
  const result = await db
    .deleteFrom('member.events')
    .where('event_id', '=', eventId)
    .executeTakeFirst()

  return (result.numDeletedRows ?? BigInt(0)) > BigInt(0)
}
