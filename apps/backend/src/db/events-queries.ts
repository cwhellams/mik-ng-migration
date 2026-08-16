import type { Updateable } from 'kysely'

import type { MemberEvents } from './schema.d.ts'
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
  eventId: string
  title: string
  description: string | null
  location: string | null
  imageUrl: string | null
  performer: string | null
  startTime: Date
  endTime: Date
  isPublic: boolean
  createdAt: Date
  createdBy: string
  updatedAt: Date
  updatedBy: string
}

const isTranslationLanguage = (language: string): language is keyof EventTranslations =>
  language === 'fi' || language === 'sv'

const getTranslationsByEventId = async (
  eventIds: string[],
): Promise<Map<string, EventTranslations>> => {
  const map = new Map<string, EventTranslations>()
  if (eventIds.length === 0) return map

  const rows = await db
    .selectFrom('member.eventTranslations')
    .select(['eventId', 'language', 'title', 'description'])
    .where('eventId', 'in', eventIds)
    .execute()

  for (const row of rows) {
    if (!isTranslationLanguage(row.language)) continue
    const translations = map.get(row.eventId) ?? {}
    translations[row.language] = { title: row.title, description: row.description }
    map.set(row.eventId, translations)
  }

  return map
}

const toEvent = (row: EventRow, translations: EventTranslations = {}): ClubEvent => ({
  eventId: row.eventId,
  title: row.title,
  description: row.description,
  location: row.location,
  imageUrl: row.imageUrl,
  performer: row.performer,
  translations,
  startTime: row.startTime.toISOString(),
  endTime: row.endTime.toISOString(),
  isPublic: row.isPublic,
  createdAt: row.createdAt.toISOString(),
  createdBy: row.createdBy,
  updatedAt: row.updatedAt.toISOString(),
  updatedBy: row.updatedBy,
})

export const getAllEvents = async (filters: EventFilters = {}): Promise<ClubEvent[]> => {
  const { from, to, publicOnly = false, limit = 200, offset = 0 } = filters

  let query = db
    .selectFrom('member.events')
    .selectAll()
    .orderBy('startTime', 'asc')
    .limit(limit)
    .offset(offset)

  if (publicOnly) {
    query = query.where('isPublic', '=', true)
  }

  if (from) {
    query = query.where('endTime', '>=', new Date(from))
  }

  if (to) {
    query = query.where('startTime', '<=', new Date(to))
  }

  const rows = await query.execute()
  const translationsByEventId = await getTranslationsByEventId(rows.map((row) => row.eventId))
  return rows.map((row) => toEvent(row, translationsByEventId.get(row.eventId)))
}

export const getEventById = async (eventId: string): Promise<ClubEvent | undefined> => {
  const row = await db
    .selectFrom('member.events')
    .selectAll()
    .where('eventId', '=', eventId)
    .executeTakeFirst()

  if (!row) return undefined

  const translationsByEventId = await getTranslationsByEventId([eventId])
  return toEvent(row, translationsByEventId.get(eventId))
}

export const getEventImageKey = async (eventId: string): Promise<string | null | undefined> => {
  const row = await db
    .selectFrom('member.events')
    .select('imageKey')
    .where('eventId', '=', eventId)
    .executeTakeFirst()

  return row?.imageKey
}

export const setEventImage = async (
  eventId: string,
  imageUrl: string,
  imageKey: string,
): Promise<ClubEvent | undefined> => {
  const row = await db
    .updateTable('member.events')
    .set({ imageUrl: imageUrl, imageKey: imageKey, updatedAt: new Date() })
    .where('eventId', '=', eventId)
    .returningAll()
    .executeTakeFirst()

  if (!row) return undefined
  const translationsByEventId = await getTranslationsByEventId([eventId])
  return toEvent(row, translationsByEventId.get(eventId))
}

export const clearEventImage = async (eventId: string): Promise<ClubEvent | undefined> => {
  const row = await db
    .updateTable('member.events')
    .set({ imageUrl: null, imageKey: null, updatedAt: new Date() })
    .where('eventId', '=', eventId)
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
    .insertInto('member.eventTranslations')
    .values({ eventId: eventId, language, title, description })
    .onConflict((oc) => oc.columns(['eventId', 'language']).doUpdateSet({ title, description }))
    .execute()
}

const deleteEventTranslation = async (eventId: string, language: 'fi' | 'sv'): Promise<void> => {
  await db
    .deleteFrom('member.eventTranslations')
    .where('eventId', '=', eventId)
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
      startTime: new Date(data.startTime),
      endTime: new Date(data.endTime),
      isPublic: data.isPublic ?? false,
      createdBy: user.memberId,
      updatedBy: user.memberId,
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  await applyTranslations(row.eventId, data.translations)

  return getEventById(row.eventId) as Promise<ClubEvent>
}

export const updateEvent = async (
  eventId: string,
  data: EventUpdate,
  user: JWTUser,
): Promise<ClubEvent | undefined> => {
  // Updateable<> rather than Record<string, unknown>: an untyped patch object hides
  // column names from the compiler, and three of these stayed snake_case through the
  // migration because of it.
  const updates: Updateable<MemberEvents> = {
    updatedAt: new Date(),
    updatedBy: user.memberId,
  }

  if (data.title !== undefined) updates.title = data.title
  if (data.description !== undefined) updates.description = data.description
  if (data.location !== undefined) updates.location = data.location
  if (data.performer !== undefined) updates.performer = data.performer
  if (data.startTime !== undefined) updates.startTime = new Date(data.startTime)
  if (data.endTime !== undefined) updates.endTime = new Date(data.endTime)
  if (data.isPublic !== undefined) updates.isPublic = data.isPublic

  const row = await db
    .updateTable('member.events')
    .set(updates)
    .where('eventId', '=', eventId)
    .returningAll()
    .executeTakeFirst()

  if (!row) return undefined

  await applyTranslations(eventId, data.translations)

  return getEventById(eventId)
}

export const deleteEvent = async (eventId: string): Promise<boolean> => {
  const result = await db
    .deleteFrom('member.events')
    .where('eventId', '=', eventId)
    .executeTakeFirst()

  return (result.numDeletedRows ?? BigInt(0)) > BigInt(0)
}
