import { sql } from 'kysely'
import * as connection from './connection.ts'
import type {
  AircraftDocument,
  AircraftDocumentAuditable,
  AircraftDocumentFilters,
} from '../routes/aircraft-documents/models.ts'
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
    .selectFrom('flight.aircraft_documents_files')
    .selectAll()
    .where('is_active', '=', true)
    .orderBy('document_type', 'asc')
    .orderBy('valid_to', 'desc')
    .orderBy('created_at', 'desc')

  if (documentId) {
    query = query.where('document_id', '=', documentId)
  }

  if (aircraftRegistration) {
    query = query.where('aircraft_registration', '=', aircraftRegistration)
  }

  if (documentType) {
    query = query.where('document_type', '=', documentType as any)
  }

  if (validOnly) {
    const now = new Date().toISOString().split('T')[0] // YYYY-MM-DD format
    query = query.where((eb: any) =>
      eb.and([
        eb.or([eb('valid_from', 'is', null), eb('valid_from', '<=', now)]),
        eb.or([eb('valid_to', 'is', null), eb('valid_to', '>=', now)]),
      ]),
    )
  }

  query = query.limit(limit).offset(offset)

  const records = await query.execute()
  return records.map((record: any) => ({
    documentId: record.document_id,
    aircraftRegistration: record.aircraft_registration,
    documentType: record.document_type,
    title: record.title,
    description: record.description,
    documentUrl: record.document_url,
    validFrom: record.valid_from || null,
    validTo: record.valid_to || null,
    isActive: record.is_active,
    fileName: record.file_name,
    fileSize: record.file_size,
    mimeType: record.mime_type,
    storageKey: record.storage_key,
    createdAt: record.created_at?.toISOString(),
    updatedAt: record.updated_at?.toISOString(),
    createdBy: record.created_by,
    updatedBy: record.updated_by,
  }))
}

export const countAircraftDocuments = async (
  filters: Partial<AircraftDocumentFilters> = {},
): Promise<number> => {
  const { aircraftRegistration, documentType, validOnly = false } = filters

  let query = connection.db
    .selectFrom('flight.aircraft_documents_files')
    .select((eb: any) => eb.fn.count('document_id').as('count'))
    .where('is_active', '=', true)

  if (aircraftRegistration) {
    query = query.where('aircraft_registration', '=', aircraftRegistration)
  }

  if (documentType) {
    query = query.where('document_type', '=', documentType as any)
  }

  if (validOnly) {
    const now = new Date().toISOString().split('T')[0] // YYYY-MM-DD format
    query = query.where((eb: any) =>
      eb.and([
        eb.or([eb('valid_from', 'is', null), eb('valid_from', '<=', now)]),
        eb.or([eb('valid_to', 'is', null), eb('valid_to', '>=', now)]),
      ]),
    )
  }

  const result = await query.executeTakeFirst()
  return Number((result as any)?.count || 0)
}

export const getAircraftDocumentById = async (
  documentId: number,
): Promise<AircraftDocumentAuditable | null> => {
  const record = await connection.db
    .selectFrom('flight.aircraft_documents_files')
    .selectAll()
    .where('document_id', '=', documentId)
    .where('is_active', '=', true)
    .executeTakeFirst()

  if (!record) return null

  return {
    documentId: record.document_id,
    aircraftRegistration: record.aircraft_registration,
    documentType: record.document_type as any,
    title: record.title,
    description: record.description,
    documentUrl: record.document_url,
    validFrom: record.valid_from || null,
    validTo: record.valid_to || null,
    isActive: record.is_active,
    fileName: record.file_name,
    fileSize: record.file_size,
    mimeType: record.mime_type,
    storageKey: record.storage_key,
    createdAt: record.created_at?.toISOString(),
    updatedAt: record.updated_at?.toISOString(),
    createdBy: record.created_by,
    updatedBy: record.updated_by,
  }
}

export const addAircraftDocument = async (
  document: AircraftDocument,
  jwt: JWTUser,
): Promise<AircraftDocumentAuditable> => {
  const now = new Date()

  const result = await connection.db
    .insertInto('flight.aircraft_documents_files')
    .values({
      aircraft_registration: document.aircraftRegistration,
      document_type: document.documentType as any,
      title: document.title,
      description: document.description || null,
      document_url: document.documentUrl || '',
      valid_from: document.validFrom || null,
      valid_to: document.validTo || null,
      is_active: document.isActive ?? true,
      file_name: document.fileName,
      file_size: document.fileSize || null,
      mime_type: document.mimeType || null,
      storage_key: document.storageKey || null,
      created_at: now,
      created_by: jwt.memberId,
      updated_at: now,
      updated_by: jwt.memberId,
    })
    .returning('document_id')
    .executeTakeFirst()

  if (!result) {
    return problem({ status: 500, detail: 'Aircraft document insert failed' })
  }

  return {
    ...document,
    documentId: result.document_id,
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

  const updateData: any = {
    updated_at: now,
    updated_by: jwt.memberId,
  }

  if (patch.title !== undefined) updateData.title = patch.title
  if (patch.description !== undefined) updateData.description = patch.description
  if (patch.documentType !== undefined) updateData.document_type = patch.documentType
  if (patch.documentUrl !== undefined) updateData.document_url = patch.documentUrl
  if (patch.validFrom !== undefined) updateData.valid_from = patch.validFrom
  if (patch.validTo !== undefined) updateData.valid_to = patch.validTo
  if (patch.isActive !== undefined) updateData.is_active = patch.isActive
  if (patch.fileName !== undefined) updateData.file_name = patch.fileName
  if (patch.fileSize !== undefined) updateData.file_size = patch.fileSize
  if (patch.mimeType !== undefined) updateData.mime_type = patch.mimeType
  if (patch.storageKey !== undefined) updateData.storage_key = patch.storageKey

  const result = await connection.db
    .updateTable('flight.aircraft_documents_files')
    .set(updateData)
    .where('document_id', '=', documentId)
    .executeTakeFirst()

  return result.numUpdatedRows == BigInt(1)
}

export const removeAircraftDocument = async (documentId: number): Promise<boolean> => {
  const result = await connection.db
    .deleteFrom('flight.aircraft_documents_files')
    .where('document_id', '=', documentId)
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

  return records.map((record: any) => record.registration)
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
    .selectFrom('flight.aircraft_documents_files as d')
    .select([
      'd.document_id',
      'd.aircraft_registration',
      'd.document_type',
      'd.title',
      'd.valid_to',
    ])
    .where('d.is_active', '=', true)
    .where('d.valid_to', '=', targetDate)
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom('flight.aircraft_documents_files as newer')
            .select(sql`1`.as('one'))
            .where('newer.aircraft_registration', '=', eb.ref('d.aircraft_registration'))
            .where('newer.document_type', '=', eb.ref('d.document_type') as any)
            .where('newer.is_active', '=', true)
            .where('newer.document_id', '!=', eb.ref('d.document_id'))
            .where(sql`newer.valid_from`, '>', sql`d.valid_to`),
        ),
      ),
    )
    .execute()

  return records.map((r: any) => ({
    documentId: r.document_id,
    aircraftRegistration: r.aircraft_registration,
    documentType: r.document_type,
    title: r.title,
    validTo: r.valid_to,
  }))
}

export const hasAircraftDocumentNotificationBeenSent = async (
  documentId: number,
  notificationType: 'REMINDER' | 'EXPIRED',
  daysThreshold: number = 0,
): Promise<boolean> => {
  const result = await connection.db
    .selectFrom('flight.aircraft_document_expiry_notifications')
    .select('id')
    .where('document_id', '=', documentId)
    .where('notification_type', '=', notificationType)
    .where('days_threshold', '=', daysThreshold)
    .executeTakeFirst()

  return result != null
}

export const recordAircraftDocumentNotificationSent = async (
  documentId: number,
  notificationType: 'REMINDER' | 'EXPIRED',
  daysThreshold: number = 0,
): Promise<void> => {
  await connection.db
    .insertInto('flight.aircraft_document_expiry_notifications')
    .values({
      document_id: documentId,
      notification_type: notificationType,
      days_threshold: daysThreshold,
    })
    .onConflict((oc) =>
      oc.columns(['document_id', 'notification_type', 'days_threshold']).doNothing(),
    )
    .execute()
}
