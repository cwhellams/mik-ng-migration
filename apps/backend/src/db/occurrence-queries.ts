import { auditCreate, auditUpdate, mapAudit } from './audit.ts'
import { sql, type ExpressionBuilder, type Kysely, type Transaction } from 'kysely'
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
} from '@mik/contracts/occurrences'
import { generateShortId } from '../util/nanoId.ts'
import * as connection from './connection.ts'
import type { DB } from './schema.d.ts'
import { camelCaseNestedRows } from './connection.ts'
import type { DbRow } from './connection.ts'
import { jsonArrayFrom } from 'kysely/helpers/postgres'
import { storageService } from '../services/storage.ts'

type Executor = Kysely<DB> | Transaction<DB>

const toOccurrence = (
  row: DbRow<'flight.occurrences'>,
  access: OccurrenceAccess[],
  attachments: OccurrenceAttachment[],
): Occurrence => {
  const status = row.status as OccurrenceStatus

  return {
    id: row.reportId,
    occurrenceDate: row.occurrenceDate.toISOString(),
    reportDate: row.reportDate.toISOString(),
    deadLine: row.deadLine?.toISOString(),
    processedDate: row.processedDate?.toISOString(),
    status,
    headline: row.headline,
    aircraftRegistration: row.registration,
    aircraftTechnicalFault: row.technicalFaults,
    categories: row.categories as OccurrenceCategory[],
    description: row.description,
    location: row.location,
    isWeatherRelevant: row.isWeatherRelevant,
    animalNumber: row.animalNumber,
    animalSize: row.animalSize,
    animalSpecies: row.animalSpecies,
    arrivalAirport: row.arrivalAirport,
    departureAirport: row.departureAirport,
    isDtoReport: row.isDtoReport,
    linkedReportId: row.linkedReportId,
    access,
    comments: row.comments as OccurrenceComment[],
    handling: row.handling as OccurrenceHandling,
    attachments,
    ...mapAudit(row),
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
          .selectFrom('flight.occurrenceAccess')
          .selectAll('flight.occurrenceAccess')
          .leftJoin(
            'member.register',
            'flight.occurrenceAccess.memberId',
            'member.register.memberId',
          )
          .select('member.register.lastName')
          .whereRef('flight.occurrenceAccess.reportId', '=', 'flight.occurrences.reportId'),
      ).as('access'),
    )
    .select((eb) =>
      jsonArrayFrom(
        eb
          .selectFrom('flight.occurrenceAttachments')
          .selectAll('flight.occurrenceAttachments')
          .leftJoin(
            'member.register',
            'flight.occurrenceAttachments.createdBy',
            'member.register.memberId',
          )
          .select('member.register.lastName')
          .whereRef('flight.occurrenceAttachments.reportId', '=', 'flight.occurrences.reportId')
          .where('flight.occurrenceAttachments.removedAt', 'is', null)
          .orderBy('flight.occurrenceAttachments.createdAt'),
      ).as('attachments'),
    )
    .where('flight.occurrences.reportId', '=', reportId)
    .where((eb) =>
      eb.exists(
        eb
          .selectFrom('flight.occurrenceAccess')
          .selectAll()
          .whereRef('flight.occurrenceAccess.reportId', '=', 'flight.occurrences.reportId')
          .where((eb) => hasAccess(eb, limitations))
          .$if(access == 'write', (qb) =>
            qb.where('flight.occurrenceAccess.writeAccess', '=', true),
          )
          .$if(access == 'manage', (qb) =>
            qb.where('flight.occurrenceAccess.manageAccess', '=', true),
          ),
      ),
    )
    .executeTakeFirst()

  if (!result) {
    return undefined
  }

  return toOccurrence(
    result,
    camelCaseNestedRows(result.access).map((a) => ({
      accessId: a.accessId,
      memberId: a.memberId,
      lastName: a.lastName,
      roleId: a.roleId,
      author: a.author,
      write: a.writeAccess,
      manage: a.manageAccess,
      at: new Date(a.updatedAt).toISOString(),
      by: a.updatedBy,
    })),
    camelCaseNestedRows(result.attachments).map((a) => ({
      attachmentId: a.attachmentId,
      fileName: a.fileName,
      mimeType: a.mimeType,
      fileSize: a.fileSize,
      originStatus: a.originStatus as OccurrenceStatus,
      at: new Date(a.createdAt).toISOString(),
      by: a.lastName ?? a.createdBy,
    })),
  )
}

const hasAccess = (
  eb: ExpressionBuilder<DB, 'flight.occurrenceAccess'>,
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
      return eb('flight.occurrenceAccess.memberId', '=', limitations.memberId)
    } else {
      return eb.or([
        eb('flight.occurrenceAccess.memberId', '=', limitations.memberId),
        eb.and([
          eb('flight.occurrenceAccess.roleId', 'in', roles),
          eb('flight.occurrenceAccess.manageAccess', 'is', false),
        ]),
      ])
    }
  } else {
    // admin roles are granted only by roles
    return eb('flight.occurrenceAccess.roleId', 'in', roles.length > 0 ? roles : ['-'])
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
      'flight.occurrenceAccess',
      'flight.occurrences.reportId',
      'flight.occurrenceAccess.reportId',
    )
    .where((eb) => hasAccess(eb, limitations))
    .$if(filters.status !== undefined, (qb) => qb.where('status', '=', filters.status!))
    .$if(filters.ignoreStatuses ? filters.ignoreStatuses.length > 0 : false, (qb) =>
      qb.where((eb) => eb('status', 'not in', filters.ignoreStatuses!)),
    )
    .distinctOn('flight.occurrences.reportId')
    .orderBy('flight.occurrences.reportId')
    .orderBy('reportDate', 'desc')
    // keep the anonymized report with the same report date ordered first
    .orderBy('createdAt', 'desc')
    .execute()

  return results.map((r) => toOccurrence(r, [], []))
}

/**
 * Pending occurrences (NEW/ANONYMIZING/ANONYMIZED) that have not yet been
 * notified for their *current* status. Once notified, a row is skipped on
 * subsequent runs until its status changes again — otherwise the daily
 * worker would re-email the same occurrence every day it stays pending.
 */
export async function getOccurrencesPendingNotification(limitations: {
  roles: string[]
}): Promise<Occurrence[]> {
  const results = await connection.db
    .selectFrom('flight.occurrences')
    .selectAll('flight.occurrences')
    .innerJoin(
      'flight.occurrenceAccess',
      'flight.occurrences.reportId',
      'flight.occurrenceAccess.reportId',
    )
    .where((eb) => hasAccess(eb, limitations))
    .where('status', 'in', [
      OccurrenceStatus.NEW,
      OccurrenceStatus.ANONYMIZING,
      OccurrenceStatus.ANONYMIZED,
    ])
    .where((eb) =>
      eb.or([eb('notifiedStatus', 'is', null), eb('notifiedStatus', '!=', eb.ref('status'))]),
    )
    .distinctOn('flight.occurrences.reportId')
    .orderBy('flight.occurrences.reportId')
    .orderBy('reportDate', 'desc')
    // keep the anonymized report with the same report date ordered first
    .orderBy('createdAt', 'desc')
    .execute()

  return results.map((r) => toOccurrence(r, [], []))
}

/**
 * Records that an occurrence has been notified for its current status, so
 * `getOccurrencesPendingNotification` skips it until the status changes.
 */
export async function markOccurrenceNotified(
  reportId: string,
  status: OccurrenceStatus,
  executor: Executor = connection.db,
): Promise<void> {
  await executor
    .updateTable('flight.occurrences')
    .set({ notifiedStatus: status, notifiedAt: new Date() })
    .where('reportId', '=', reportId)
    .execute()
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
  executor: Executor = connection.db,
): Promise<Occurrence> {
  const now = new Date()

  const created: Occurrence = {
    ...occurrence,
    id: generateShortId(),
    handling: {},
    attachments: [],
    ...auditCreate(user, now.toISOString()),
  }

  await executor
    .insertInto('flight.occurrences')
    .values({
      reportId: created.id,
      occurrenceDate: created.occurrenceDate,
      reportDate: created.reportDate,
      deadLine: created.deadLine,
      status: created.status,
      headline: created.headline,
      location: created.location,
      description: created.description,
      categories: JSON.stringify(created.categories),
      isWeatherRelevant: created.isWeatherRelevant,
      animalNumber: created.animalNumber,
      animalSize: created.animalSize,
      animalSpecies: created.animalSpecies,
      registration: created.aircraftRegistration,
      technicalFaults: created.aircraftTechnicalFault,
      arrivalAirport: created.arrivalAirport,
      departureAirport: created.departureAirport,
      isDtoReport: created.isDtoReport,
      linkedReportId: created.linkedReportId,
      comments: JSON.stringify(created.comments),
      handling: JSON.stringify(created.handling),
      createdAt: created.createdAt,
      createdBy: created.createdBy,
      updatedAt: created.updatedAt,
      updatedBy: created.updatedBy,
    })
    .execute()

  const access = await addOccurrenceAccess(created.id, user, executor, ...occurrence.access)

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
  executor: Executor = connection.db,
): Promise<Occurrence> {
  const now = new Date().toISOString()
  const updated: Occurrence = {
    ...existing,
    ...patch,
    ...auditUpdate(user, now),
  }

  await executor
    .updateTable('flight.occurrences')
    .set({
      occurrenceDate: patch.occurrenceDate,
      deadLine: patch.deadLine,
      status: patch.status,
      headline: patch.headline,
      location: patch.location,
      description: patch.description,
      categories: patch.categories ? JSON.stringify(patch.categories) : undefined,
      isWeatherRelevant: patch.isWeatherRelevant,
      animalNumber: patch.animalNumber,
      animalSize: patch.animalSize,
      animalSpecies: patch.animalSpecies,
      registration: patch.aircraftRegistration,
      technicalFaults: patch.aircraftTechnicalFault,
      arrivalAirport: patch.arrivalAirport,
      departureAirport: patch.departureAirport,
      isDtoReport: patch.isDtoReport,
      linkedReportId: patch.linkedReportId,
      comments: updated.comments ? JSON.stringify(updated.comments) : undefined,
      handling: updated.handling ? JSON.stringify(updated.handling) : undefined,
      updatedBy: updated.updatedBy,
      updatedAt: updated.updatedAt,
    })
    .where('reportId', '=', existing.id)
    .execute()

  return updated
}

export const addOccurrenceAccess = async (
  reportId: string,
  user: JWTUser,
  executor: Executor = connection.db,
  ...access: OccurrenceAccess[]
): Promise<OccurrenceAccess[]> => {
  // One timestamp for the whole insert: called inside the map, each row would get its
  // own instant and the batch would look like several separate edits.
  const now = new Date()
  const inserted = await executor
    .insertInto('flight.occurrenceAccess')
    .values(
      access.map((access) => ({
        reportId: reportId,
        memberId: access.memberId,
        roleId: access.roleId,
        author: access.author,
        writeAccess: access.write,
        manageAccess: access.manage,
        ...auditUpdate(user.memberId, now),
      })),
    )
    .returningAll()
    .execute()

  return inserted.map((a) => ({
    accessId: a.accessId,
    memberId: a.memberId,
    roleId: a.roleId,
    author: a.author,
    write: a.writeAccess,
    manage: a.manageAccess,
    at: a.updatedAt.toISOString(),
    by: a.updatedBy,
  }))
}

export const updateOccurrenceAccess = async (
  reportId: string,
  access: OccurrenceAccess,
  user: JWTUser,
  executor: Executor = connection.db,
) =>
  executor
    .updateTable('flight.occurrenceAccess')
    .set({
      writeAccess: access.write,
      manageAccess: access.manage,
      ...auditUpdate(user.memberId),
    })
    .where('reportId', '=', reportId)
    .where('accessId', '=', access.accessId!)
    .execute()

export const deleteOccurrenceAccess = async (reportId: string, ...accessIds: number[]) =>
  await connection.db
    .deleteFrom('flight.occurrenceAccess')
    .where('reportId', '=', reportId)
    .where('accessId', 'in', accessIds)
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
  executor: Executor = connection.db,
): Promise<DbRow<'flight.occurrenceAttachments'>> => {
  const now = new Date()
  return executor
    .insertInto('flight.occurrenceAttachments')
    .values({
      reportId: reportId,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
      storageKey: attachment.storageKey,
      originStatus: attachment.originStatus,
      ...auditCreate(createdBy, now),
    })
    .returningAll()
    .executeTakeFirstOrThrow()
}

const mapAttachmentRow = (
  row: DbRow<'flight.occurrenceAttachments'>,
  by: string,
): OccurrenceAttachment => ({
  attachmentId: row.attachmentId,
  fileName: row.fileName,
  mimeType: row.mimeType,
  fileSize: row.fileSize,
  originStatus: row.originStatus as OccurrenceStatus,
  at: row.createdAt.toISOString(),
  by,
})

// Enforces the per-report attachment cap atomically: an advisory lock scoped to the
// report id serializes concurrent uploads so the count check below can't race with
// another upload's insert.
export const addOccurrenceAttachment = async (
  reportId: string,
  attachment: NewOccurrenceAttachment,
  user: JWTUser,
  maxAttachments: number,
): Promise<OccurrenceAttachment | undefined> =>
  connection.db.transaction().execute(async (trx) => {
    await sql`select pg_advisory_xact_lock(hashtext(${reportId}))`.execute(trx)

    const { count } = await trx
      .selectFrom('flight.occurrenceAttachments')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('reportId', '=', reportId)
      .where('removedAt', 'is', null)
      .executeTakeFirstOrThrow()
    if (Number(count) >= maxAttachments) {
      return undefined
    }

    const row = await insertOccurrenceAttachment(reportId, attachment, user.memberId, trx)
    return mapAttachmentRow(row, user.lastName)
  })

export const getOccurrenceAttachment = async (reportId: string, attachmentId: number) =>
  connection.db
    .selectFrom('flight.occurrenceAttachments')
    .selectAll()
    .where('reportId', '=', reportId)
    .where('attachmentId', '=', attachmentId)
    .where('removedAt', 'is', null)
    .executeTakeFirst()

export const countOccurrenceAttachments = async (reportId: string): Promise<number> => {
  const result = await connection.db
    .selectFrom('flight.occurrenceAttachments')
    .select((eb) => eb.fn.countAll().as('count'))
    .where('reportId', '=', reportId)
    .where('removedAt', 'is', null)
    .executeTakeFirstOrThrow()
  return Number(result.count)
}

export const removeOccurrenceAttachment = async (
  reportId: string,
  attachmentId: number,
  bucketName: string,
  user: JWTUser,
): Promise<void> => {
  const removed = await connection.db
    .updateTable('flight.occurrenceAttachments')
    .set({
      removedAt: new Date(),
      removedBy: user.memberId,
      ...auditUpdate(user.memberId),
    })
    .where('reportId', '=', reportId)
    .where('attachmentId', '=', attachmentId)
    .returning('storageKey')
    .executeTakeFirst()

  if (removed) {
    await storageService.deleteFile(removed.storageKey, bucketName)
  }
}

// Copies every non-hidden attachment from one report to another, preserving the
// original uploader and origin status, so the anonymized copy still shows whether
// a picture came from the original report or was added later.
export const copyOccurrenceAttachments = async (
  fromReportId: string,
  toReportId: string,
  bucketName: string,
  executor: Executor = connection.db,
): Promise<OccurrenceAttachment[]> => {
  const source = await executor
    .selectFrom('flight.occurrenceAttachments')
    .selectAll('flight.occurrenceAttachments')
    .leftJoin(
      'member.register',
      'flight.occurrenceAttachments.createdBy',
      'member.register.memberId',
    )
    .select('member.register.lastName')
    .where('flight.occurrenceAttachments.reportId', '=', fromReportId)
    .where('flight.occurrenceAttachments.removedAt', 'is', null)
    .execute()

  return Promise.all(
    source.map(async (attachment) => {
      const destKey = attachment.storageKey.replace(
        `occurrences/${fromReportId}/`,
        `occurrences/${toReportId}/`,
      )
      await storageService.copyFile(attachment.storageKey, destKey, bucketName)
      const row = await insertOccurrenceAttachment(
        toReportId,
        {
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          fileSize: attachment.fileSize,
          storageKey: destKey,
          originStatus: attachment.originStatus as OccurrenceStatus,
        },
        attachment.createdBy,
        executor,
      )
      return mapAttachmentRow(row, attachment.lastName ?? attachment.createdBy)
    }),
  )
}
