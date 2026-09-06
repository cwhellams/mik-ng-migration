import { auditCreate, auditUpdate } from './audit.ts'
import type { Updateable } from 'kysely'

import type {
  FlightAircraftDocumentsFiles,
  FlightAircraftDocumentType,
} from '@mik/db-schema/schema'
import type { DbRow } from './connection.ts'
import { sql } from 'kysely'
import * as connection from './connection.ts'
import type {
  AircraftDocument,
  AircraftDocumentAuditable,
  AircraftDocumentFilters,
} from '@mik/contracts/aircraft-documents'
import type { JWTUser } from '../routes/auth/token.ts'
import { problem } from '../routes/response.ts'

export const getAllAircraftDocuments = async (
  filters: Partial<AircraftDocumentFilters> = {},
): Promise<AircraftDocumentAuditable[]> => {
  const {
    documentId,
    aircraftRegistration,
    documentType,
    validOnly = false,
    limit = 100,
    offset = 0,
  } = filters

  let query = connection.db
    .selectFrom('flight.aircraftDocumentsFiles')
    .selectAll()
    .where('isActive', '=', true)
    .orderBy('documentType', 'asc')
    .orderBy('validTo', 'desc')
    .orderBy('createdAt', 'desc')

  if (documentId) {
    query = query.where('documentId', '=', documentId)
  }

  if (aircraftRegistration) {
    query = query.where('aircraftRegistration', '=', aircraftRegistration)
  }

  if (documentType) {
    query = query.where('documentType', '=', documentType as FlightAircraftDocumentType)
  }

  if (validOnly) {
    const now = new Date().toISOString().split('T')[0] // YYYY-MM-DD format
    query = query.where((eb) =>
      eb.and([
        eb.or([eb('validFrom', 'is', null), eb('validFrom', '<=', now)]),
        eb.or([eb('validTo', 'is', null), eb('validTo', '>=', now)]),
      ]),
    )
  }

  query = query.limit(limit).offset(offset)

  const records = await query.execute()
  return records.map((record: DbRow<'flight.aircraftDocumentsFiles'>) => ({
    documentId: record.documentId,
    aircraftRegistration: record.aircraftRegistration,
    documentType: record.documentType,
    title: record.title,
    description: record.description,
    documentUrl: record.documentUrl,
    validFrom: record.validFrom || null,
    validTo: record.validTo || null,
    isActive: record.isActive,
    fileName: record.fileName,
    fileSize: record.fileSize,
    mimeType: record.mimeType,
    storageKey: record.storageKey,
    createdAt: record.createdAt?.toISOString(),
    updatedAt: record.updatedAt?.toISOString(),
    createdBy: record.createdBy,
    updatedBy: record.updatedBy,
  }))
}

export const countAircraftDocuments = async (
  filters: Partial<AircraftDocumentFilters> = {},
): Promise<number> => {
  const { aircraftRegistration, documentType, validOnly = false } = filters

  let query = connection.db
    .selectFrom('flight.aircraftDocumentsFiles')
    .select((eb) => eb.fn.count('documentId').as('count'))
    .where('isActive', '=', true)

  if (aircraftRegistration) {
    query = query.where('aircraftRegistration', '=', aircraftRegistration)
  }

  if (documentType) {
    query = query.where('documentType', '=', documentType as FlightAircraftDocumentType)
  }

  if (validOnly) {
    const now = new Date().toISOString().split('T')[0] // YYYY-MM-DD format
    query = query.where((eb) =>
      eb.and([
        eb.or([eb('validFrom', 'is', null), eb('validFrom', '<=', now)]),
        eb.or([eb('validTo', 'is', null), eb('validTo', '>=', now)]),
      ]),
    )
  }

  const result = await query.executeTakeFirst()
  return Number(result?.count ?? 0)
}

export const getAircraftDocumentById = async (
  documentId: number,
): Promise<AircraftDocumentAuditable | null> => {
  const record = await connection.db
    .selectFrom('flight.aircraftDocumentsFiles')
    .selectAll()
    .where('documentId', '=', documentId)
    .where('isActive', '=', true)
    .executeTakeFirst()

  if (!record) return null

  return {
    documentId: record.documentId,
    aircraftRegistration: record.aircraftRegistration,
    documentType: record.documentType as AircraftDocument['documentType'],
    title: record.title,
    description: record.description,
    documentUrl: record.documentUrl,
    validFrom: record.validFrom || null,
    validTo: record.validTo || null,
    isActive: record.isActive,
    fileName: record.fileName,
    fileSize: record.fileSize,
    mimeType: record.mimeType,
    storageKey: record.storageKey,
    createdAt: record.createdAt?.toISOString(),
    updatedAt: record.updatedAt?.toISOString(),
    createdBy: record.createdBy,
    updatedBy: record.updatedBy,
  }
}

export const addAircraftDocument = async (
  document: AircraftDocument,
  jwt: JWTUser,
): Promise<AircraftDocumentAuditable> => {
  const now = new Date()

  const result = await connection.db
    .insertInto('flight.aircraftDocumentsFiles')
    .values({
      aircraftRegistration: document.aircraftRegistration,
      documentType: document.documentType as FlightAircraftDocumentType,
      title: document.title,
      description: document.description || null,
      documentUrl: document.documentUrl || '',
      validFrom: document.validFrom || null,
      validTo: document.validTo || null,
      isActive: document.isActive ?? true,
      fileName: document.fileName,
      fileSize: document.fileSize || null,
      mimeType: document.mimeType || null,
      storageKey: document.storageKey || null,
      ...auditCreate(jwt.memberId, now),
    })
    .returning('documentId')
    .executeTakeFirst()

  if (!result) {
    return problem({ status: 500, detail: 'Aircraft document insert failed' })
  }

  return {
    ...document,
    documentId: result.documentId,
    isActive: document.isActive ?? true,
    createdAt: now.toISOString(),
    createdBy: jwt.memberId,
    updatedAt: now.toISOString(),
    updatedBy: jwt.memberId,
  }
}

export const updateAircraftDocument = async (
  documentId: number,
  patch: Partial<AircraftDocument>,
  jwt: JWTUser,
): Promise<boolean> => {
  const now = new Date()

  const updateData: Updateable<FlightAircraftDocumentsFiles> = {
    ...auditUpdate(jwt.memberId, now),
  }

  if (patch.title !== undefined) updateData.title = patch.title
  if (patch.description !== undefined) updateData.description = patch.description
  if (patch.documentType !== undefined) updateData.documentType = patch.documentType
  if (patch.documentUrl !== undefined) updateData.documentUrl = patch.documentUrl
  if (patch.validFrom !== undefined) updateData.validFrom = patch.validFrom
  if (patch.validTo !== undefined) updateData.validTo = patch.validTo
  if (patch.isActive !== undefined) updateData.isActive = patch.isActive
  if (patch.fileName !== undefined) updateData.fileName = patch.fileName
  if (patch.fileSize !== undefined) updateData.fileSize = patch.fileSize
  if (patch.mimeType !== undefined) updateData.mimeType = patch.mimeType
  if (patch.storageKey !== undefined) updateData.storageKey = patch.storageKey

  const result = await connection.db
    .updateTable('flight.aircraftDocumentsFiles')
    .set(updateData)
    .where('documentId', '=', documentId)
    .executeTakeFirst()

  return result.numUpdatedRows == BigInt(1)
}

export const removeAircraftDocument = async (documentId: number): Promise<boolean> => {
  const result = await connection.db
    .deleteFrom('flight.aircraftDocumentsFiles')
    .where('documentId', '=', documentId)
    .executeTakeFirst()

  return result.numDeletedRows == BigInt(1)
}

export const getAircraftRegistrations = async (): Promise<string[]> => {
  const records = await connection.db
    .selectFrom('flight.aircraft')
    .select('registration')
    .where('active', '=', true)
    .orderBy('registration', 'asc')
    .execute()

  return records.map((record) => record.registration)
}

export interface ExpiringAircraftDocument {
  documentId: number
  aircraftRegistration: string
  documentType: string
  title: string
  validTo: string
}

/**
 * Find active documents with valid_to = targetDate that have no newer successor
 * document of the same type+aircraft (valid_from > this doc's valid_to).
 */
export const getAircraftDocumentsExpiringOn = async (
  targetDate: string,
): Promise<ExpiringAircraftDocument[]> => {
  const records = await connection.db
    .selectFrom('flight.aircraftDocumentsFiles as d')
    .select(['d.documentId', 'd.aircraftRegistration', 'd.documentType', 'd.title', 'd.validTo'])
    .where('d.isActive', '=', true)
    .where('d.validTo', '=', targetDate)
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom('flight.aircraftDocumentsFiles as newer')
            .select(sql`1`.as('one'))
            .where('newer.aircraftRegistration', '=', eb.ref('d.aircraftRegistration'))
            .where('newer.documentType', '=', eb.ref('d.documentType'))
            .where('newer.isActive', '=', true)
            .where('newer.documentId', '!=', eb.ref('d.documentId'))
            .whereRef('newer.validFrom', '>', 'd.validTo'),
        ),
      ),
    )
    .execute()

  return records.map((r) => ({
    documentId: r.documentId,
    aircraftRegistration: r.aircraftRegistration,
    documentType: r.documentType,
    title: r.title,
    // Non-null by construction: the query matches validTo against a non-null
    // targetDate. The column type is nullable, which `r: any` used to paper over.
    validTo: r.validTo!,
  }))
}

export const hasAircraftDocumentNotificationBeenSent = async (
  documentId: number,
  notificationType: 'REMINDER' | 'EXPIRED',
  daysThreshold: number = 0,
): Promise<boolean> => {
  const result = await connection.db
    .selectFrom('flight.aircraftDocumentExpiryNotifications')
    .select('id')
    .where('documentId', '=', documentId)
    .where('notificationType', '=', notificationType)
    .where('daysThreshold', '=', daysThreshold)
    .executeTakeFirst()

  return result != null
}

export const recordAircraftDocumentNotificationSent = async (
  documentId: number,
  notificationType: 'REMINDER' | 'EXPIRED',
  daysThreshold: number = 0,
): Promise<void> => {
  await connection.db
    .insertInto('flight.aircraftDocumentExpiryNotifications')
    .values({
      documentId: documentId,
      notificationType: notificationType,
      daysThreshold: daysThreshold,
    })
    .onConflict((oc) => oc.columns(['documentId', 'notificationType', 'daysThreshold']).doNothing())
    .execute()
}
