import type { ExpressionBuilder, Selectable } from 'kysely'
import type { JWTUser } from '../routes/auth/token.ts'
import {
  OccurrenceCategory,
  OccurrenceStatus,
  type Occurrence,
  type OccurrenceComment,
  type OccurrenceHandling,
  type OccurrenceAccess,
  type OccurrenceAttachment,
  type OccurrenceUpsert,
  type OccurrenceFilters,
} from '../routes/occurrences/models.ts'
import { generateShortId } from '../util/nanoId.ts'
import * as connection from './connection.ts'
import type { DB, FlightOccurrences, FlightOccurrenceAttachments } from './schema.js'
import { jsonArrayFrom } from 'kysely/helpers/postgres'
import { storageService } from '../services/storage.ts'

const toOccurrence = (
  row: Selectable<FlightOccurrences>,
  access: OccurrenceAccess[],
  attachments: OccurrenceAttachment[],
): Occurrence => {
  const status = row.status as OccurrenceStatus

  return {
    id: row.report_id,
    occurrenceDate: row.occurrence_date.toISOString(),
    reportDate: row.report_date.toISOString(),
    deadLine: row.dead_line?.toISOString(),
    processedDate: row.processed_date?.toISOString(),
    status,
    headline: row.headline,
    aircraftRegistration: row.registration,
    aircraftTechnicalFault: row.technical_faults,
    categories: row.categories as OccurrenceCategory[],
    description: row.description,
    location: row.location,
    isWeatherRelevant: row.is_weather_relevant,
    animalNumber: row.animal_number,
    animalSize: row.animal_size,
    animalSpecies: row.animal_species,
    arrivalAirport: row.arrival_airport,
    departureAirport: row.departure_airport,
    isDtoReport: row.is_dto_report,
    linkedReportId: row.linked_report_id,
    access,
    comments: row.comments as OccurrenceComment[],
    handling: row.handling as OccurrenceHandling,
    attachments,
    createdAt: row.created_at.toISOString(),
    createdBy: row.created_by,
    updatedAt: row.updated_at.toISOString(),
    updatedBy: row.updated_by,
  }
}

export const getOccurrence = async (
  reportId: string,
  limitations: {
    memberId?: string
    roles?: string[]
  },
  access: 'read' | 'write' | 'manage',
): Promise<Occurrence | undefined> => {
  const result = await connection.db
    .selectFrom('flight.occurrences')
    .selectAll()
    .select((eb) =>
      jsonArrayFrom(
        eb
          .selectFrom('flight.occurrence_access')
          .selectAll('flight.occurrence_access')
          .leftJoin(
            'member.register',
            'flight.occurrence_access.member_id',
            'member.register.member_id',
          )
          .select('member.register.last_name')
          .whereRef('flight.occurrence_access.report_id', '=', 'flight.occurrences.report_id'),
      ).as('access'),
    )
    .select((eb) =>
      jsonArrayFrom(
        eb
          .selectFrom('flight.occurrence_attachments')
          .selectAll('flight.occurrence_attachments')
          .leftJoin(
            'member.register',
            'flight.occurrence_attachments.created_by',
            'member.register.member_id',
          )
          .select('member.register.last_name')
          .whereRef('flight.occurrence_attachments.report_id', '=', 'flight.occurrences.report_id')
          .where('flight.occurrence_attachments.removed_at', 'is', null)
          .orderBy('flight.occurrence_attachments.created_at'),
      ).as('attachments'),
    )
    .where('flight.occurrences.report_id', '=', reportId)
    .where((eb) =>
      eb.exists(
        eb
          .selectFrom('flight.occurrence_access')
          .selectAll()
          .whereRef('flight.occurrence_access.report_id', '=', 'flight.occurrences.report_id')
          .where((eb) => hasAccess(eb, limitations))
          .$if(access == 'write', (qb) =>
            qb.where('flight.occurrence_access.write_access', '=', true),
          )
          .$if(access == 'manage', (qb) =>
            qb.where('flight.occurrence_access.manage_access', '=', true),
          ),
      ),
    )
    .executeTakeFirst()

  if (!result) {
    return undefined
  }

  return toOccurrence(
    result,
    result.access.map((a) => ({
      accessId: a.access_id,
      memberId: a.member_id,
      lastName: a.last_name,
      roleId: a.role_id,
      author: a.author,
      write: a.write_access,
      manage: a.manage_access,
      at: new Date(a.updated_at).toISOString(),
      by: a.updated_by,
    })),
    result.attachments.map((a) => ({
      attachmentId: a.attachment_id,
      fileName: a.file_name,
      mimeType: a.mime_type,
      fileSize: a.file_size,
      originStatus: a.origin_status as OccurrenceStatus,
      at: new Date(a.created_at).toISOString(),
      by: a.last_name ?? a.created_by,
    })),
  )
}

const hasAccess = (
  eb: ExpressionBuilder<DB, 'flight.occurrence_access'>,
  limitations: {
    memberId?: string
    roles?: string[]
  },
) => {
  const roles = limitations.roles && limitations.roles.length > 0 ? limitations.roles : []

  if (limitations.memberId) {
    // check either direct member access or role-based access for non-admin roles

    if (roles.length === 0) {
      // no roles, just member access
      return eb('flight.occurrence_access.member_id', '=', limitations.memberId)
    } else {
      return eb.or([
        eb('flight.occurrence_access.member_id', '=', limitations.memberId),
        eb.and([
          eb('flight.occurrence_access.role_id', 'in', roles),
          eb('flight.occurrence_access.manage_access', 'is', false),
        ]),
      ])
    }
  } else {
    // admin roles are granted only by roles
    return eb('flight.occurrence_access.role_id', 'in', roles.length > 0 ? roles : ['-'])
  }
}

export async function getOccurrences(
  filters: OccurrenceFilters,
  limitations: {
    memberId?: string
    roles: string[]
  },
): Promise<Occurrence[]> {
  const results = await connection.db
    .selectFrom('flight.occurrences')
    .selectAll()
    .innerJoin(
      'flight.occurrence_access',
      'flight.occurrences.report_id',
      'flight.occurrence_access.report_id',
    )
    .where((eb) => hasAccess(eb, limitations))
    .$if(filters.status !== undefined, (qb) => qb.where('status', '=', filters.status!))
    .$if(filters.ignoreStatuses ? filters.ignoreStatuses.length > 0 : false, (qb) =>
      qb.where((eb) => eb('status', 'not in', filters.ignoreStatuses!)),
    )
    .distinctOn('flight.occurrences.report_id')
    .orderBy('flight.occurrences.report_id')
    .orderBy('report_date', 'desc')
    // keep the anonymized report with the same report date ordered first
    .orderBy('created_at', 'desc')
    .execute()

  return results.map((r) => toOccurrence(r, [], []))
}

export async function createOccurrence(
  occurrence: OccurrenceUpsert & {
    reportDate: string
    deadLine: string | undefined
    status: OccurrenceStatus
    linkedReportId: string | null
    access: OccurrenceAccess[]
    comments: OccurrenceComment[]
  },
  user: JWTUser,
): Promise<Occurrence> {
  const now = new Date()

  const created: Occurrence = {
    ...occurrence,
    id: generateShortId(),
    handling: {},
    attachments: [],
    createdAt: now.toISOString(),
    createdBy: user.memberId,
    updatedAt: now.toISOString(),
    updatedBy: user.memberId,
  }

  await connection.db
    .insertInto('flight.occurrences')
    .values({
      report_id: created.id,
      occurrence_date: created.occurrenceDate,
      report_date: created.reportDate,
      dead_line: created.deadLine,
      status: created.status,
      headline: created.headline,
      location: created.location,
      description: created.description,
      categories: JSON.stringify(created.categories),
      is_weather_relevant: created.isWeatherRelevant,
      animal_number: created.animalNumber,
      animal_size: created.animalSize,
      animal_species: created.animalSpecies,
      registration: created.aircraftRegistration,
      technical_faults: created.aircraftTechnicalFault,
      arrival_airport: created.arrivalAirport,
      departure_airport: created.departureAirport,
      is_dto_report: created.isDtoReport,
      linked_report_id: created.linkedReportId,
      comments: JSON.stringify(created.comments),
      handling: JSON.stringify(created.handling),
      created_at: created.createdAt,
      created_by: created.createdBy,
      updated_at: created.updatedAt,
      updated_by: created.updatedBy,
    })
    .execute()

  const access = await addOccurrenceAccess(created.id, user, ...occurrence.access)

  return { ...created, access }
}
export async function updateOccurrence(
  existing: Occurrence,
  patch: Partial<
    OccurrenceUpsert & {
      status: OccurrenceStatus
      linkedReportId: string | null
      deadLine: string | undefined
      comments: OccurrenceComment[]
      handling: OccurrenceHandling
    }
  >,
  user: JWTUser,
): Promise<Occurrence> {
  const now = new Date().toISOString()
  const updated: Occurrence = {
    ...existing,
    ...patch,
    updatedBy: user.memberId,
    updatedAt: now,
  }

  await connection.db
    .updateTable('flight.occurrences')
    .set({
      occurrence_date: patch.occurrenceDate,
      dead_line: patch.deadLine,
      status: patch.status,
      headline: patch.headline,
      location: patch.location,
      description: patch.description,
      categories: patch.categories ? JSON.stringify(patch.categories) : undefined,
      is_weather_relevant: patch.isWeatherRelevant,
      animal_number: patch.animalNumber,
      animal_size: patch.animalSize,
      animal_species: patch.animalSpecies,
      registration: patch.aircraftRegistration,
      technical_faults: patch.aircraftTechnicalFault,
      arrival_airport: patch.arrivalAirport,
      departure_airport: patch.departureAirport,
      is_dto_report: patch.isDtoReport,
      linked_report_id: patch.linkedReportId,
      comments: updated.comments ? JSON.stringify(updated.comments) : undefined,
      handling: updated.handling ? JSON.stringify(updated.handling) : undefined,
      updated_by: updated.updatedBy,
      updated_at: updated.updatedAt,
    })
    .where('report_id', '=', existing.id)
    .execute()

  return updated
}

export const addOccurrenceAccess = async (
  reportId: string,
  user: JWTUser,
  ...access: OccurrenceAccess[]
): Promise<OccurrenceAccess[]> => {
  const inserted = await connection.db
    .insertInto('flight.occurrence_access')
    .values(
      access.map((access) => ({
        report_id: reportId,
        member_id: access.memberId,
        role_id: access.roleId,
        author: access.author,
        write_access: access.write,
        manage_access: access.manage,
        updated_at: new Date(),
        updated_by: user.memberId,
      })),
    )
    .returningAll()
    .execute()

  return inserted.map((a) => ({
    accessId: a.access_id,
    memberId: a.member_id,
    roleId: a.role_id,
    author: a.author,
    write: a.write_access,
    manage: a.manage_access,
    at: a.updated_at.toISOString(),
    by: a.updated_by,
  }))
}

export const updateOccurrenceAccess = async (
  reportId: string,
  access: OccurrenceAccess,
  user: JWTUser,
) =>
  connection.db
    .updateTable('flight.occurrence_access')
    .set({
      write_access: access.write,
      manage_access: access.manage,
      updated_at: new Date(),
      updated_by: user.memberId,
    })
    .where('report_id', '=', reportId)
    .where('access_id', '=', access.accessId!)
    .execute()

export const deleteOccurrenceAccess = async (reportId: string, ...accessIds: number[]) =>
  await connection.db
    .deleteFrom('flight.occurrence_access')
    .where('report_id', '=', reportId)
    .where('access_id', 'in', accessIds)
    .execute()

interface NewOccurrenceAttachment {
  fileName: string
  mimeType: string
  fileSize: number
  storageKey: string
  originStatus: OccurrenceStatus
}

const insertOccurrenceAttachment = async (
  reportId: string,
  attachment: NewOccurrenceAttachment,
  createdBy: string,
): Promise<Selectable<FlightOccurrenceAttachments>> => {
  const now = new Date()
  return connection.db
    .insertInto('flight.occurrence_attachments')
    .values({
      report_id: reportId,
      file_name: attachment.fileName,
      mime_type: attachment.mimeType,
      file_size: attachment.fileSize,
      storage_key: attachment.storageKey,
      origin_status: attachment.originStatus,
      created_at: now,
      created_by: createdBy,
      updated_at: now,
      updated_by: createdBy,
    })
    .returningAll()
    .executeTakeFirstOrThrow()
}

export const addOccurrenceAttachment = async (
  reportId: string,
  attachment: NewOccurrenceAttachment,
  user: JWTUser,
): Promise<OccurrenceAttachment> => {
  const row = await insertOccurrenceAttachment(reportId, attachment, user.memberId)

  return {
    attachmentId: row.attachment_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    originStatus: row.origin_status as OccurrenceStatus,
    at: row.created_at.toISOString(),
    by: user.lastName,
  }
}

export const getOccurrenceAttachment = async (reportId: string, attachmentId: number) =>
  connection.db
    .selectFrom('flight.occurrence_attachments')
    .selectAll()
    .where('report_id', '=', reportId)
    .where('attachment_id', '=', attachmentId)
    .where('removed_at', 'is', null)
    .executeTakeFirst()

export const countOccurrenceAttachments = async (reportId: string): Promise<number> => {
  const result = await connection.db
    .selectFrom('flight.occurrence_attachments')
    .select((eb) => eb.fn.countAll().as('count'))
    .where('report_id', '=', reportId)
    .where('removed_at', 'is', null)
    .executeTakeFirstOrThrow()
  return Number(result.count)
}

export const removeOccurrenceAttachment = async (
  reportId: string,
  attachmentId: number,
  user: JWTUser,
): Promise<void> => {
  await connection.db
    .updateTable('flight.occurrence_attachments')
    .set({
      removed_at: new Date(),
      removed_by: user.memberId,
      updated_at: new Date(),
      updated_by: user.memberId,
    })
    .where('report_id', '=', reportId)
    .where('attachment_id', '=', attachmentId)
    .execute()
}

// Copies every non-hidden attachment from one report to another, preserving the
// original uploader and origin status, so the anonymized copy still shows whether
// a picture came from the original report or was added later.
export const copyOccurrenceAttachments = async (
  fromReportId: string,
  toReportId: string,
): Promise<OccurrenceAttachment[]> => {
  const source = await connection.db
    .selectFrom('flight.occurrence_attachments')
    .selectAll('flight.occurrence_attachments')
    .leftJoin(
      'member.register',
      'flight.occurrence_attachments.created_by',
      'member.register.member_id',
    )
    .select('member.register.last_name')
    .where('flight.occurrence_attachments.report_id', '=', fromReportId)
    .where('flight.occurrence_attachments.removed_at', 'is', null)
    .execute()

  const copies: OccurrenceAttachment[] = []
  for (const attachment of source) {
    const destKey = attachment.storage_key.replace(
      `occurrences/${fromReportId}/`,
      `occurrences/${toReportId}/`,
    )
    await storageService.copyFile(attachment.storage_key, destKey)
    const row = await insertOccurrenceAttachment(
      toReportId,
      {
        fileName: attachment.file_name,
        mimeType: attachment.mime_type,
        fileSize: attachment.file_size,
        storageKey: destKey,
        originStatus: attachment.origin_status as OccurrenceStatus,
      },
      attachment.created_by,
    )
    copies.push({
      attachmentId: row.attachment_id,
      fileName: row.file_name,
      mimeType: row.mime_type,
      fileSize: row.file_size,
      originStatus: row.origin_status as OccurrenceStatus,
      at: row.created_at.toISOString(),
      by: attachment.last_name ?? attachment.created_by,
    })
  }
  return copies
}
