import * as connection from './connection.ts'
import { sql } from 'kysely'
import type { Document, DocumentFilters } from '@mik/contracts/documents'
import type { JWTUser } from '../routes/auth/token.ts'
import type { Upsert } from '@mik/contracts/schema'
import { problem } from '../routes/response.ts'

export const getAllDocuments = async (
  filters: DocumentFilters = {
    showArchived: false,
  },
): Promise<Document[]> => {
  const { category, search, tags, showArchived = false, limit = 100, offset = 0 } = filters

  let query = connection.db
    .selectFrom('member.documents')
    .selectAll()
    .where('is_public', '=', true)
    .where('is_archived', '=', showArchived)
    .orderBy('published_date', 'desc')
    .orderBy('created_at', 'desc')

  if (category) {
    const categoryArray = category
      .split(',')
      .map((c) => c.trim())
      .filter((c) => c.length > 0)
    if (categoryArray.length === 1) {
      query = query.where('category', '=', categoryArray[0])
    } else if (categoryArray.length > 1) {
      query = query.where('category', 'in', categoryArray)
    }
  }

  if (search) {
    query = query.where((eb) =>
      eb.or([
        eb('title', 'ilike', `%${search}%`),
        eb('description', 'ilike', `%${search}%`),
        // Simple tag search - check if any tag contains search term
        eb(sql`COALESCE(array_to_string(tags, ','), '')`, 'ilike', `%${search}%`),
      ]),
    )
  }

  if (tags) {
    // Search for documents that contain any of the specified tags
    const tagArray = tags
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0)
    if (tagArray.length > 0) {
      query = query.where((eb) =>
        eb.or(
          tagArray.map((tag) =>
            eb(sql`COALESCE(array_to_string(tags, ','), '')`, 'ilike', `%${tag}%`),
          ),
        ),
      )
    }
  }

  query = query.limit(limit).offset(offset)

  const records = await query.execute()
  return records.map((record) => ({
    documentId: record.document_id,
    title: record.title,
    description: record.description,
    category: record.category,
    documentUrl: record.document_url,
    publishedDate: record.published_date,
    isPublic: record.is_public,
    isArchived: record.is_archived,
    tags: record.tags ?? [],
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

export const countDocuments = async (
  filters: DocumentFilters = { showArchived: false },
): Promise<number> => {
  const { category, search, tags, showArchived = false } = filters

  let query = connection.db
    .selectFrom('member.documents')
    .select((eb) => eb.fn.count('document_id').as('count'))
    .where('is_public', '=', true)

  // Filter by archive status
  if (!showArchived) {
    query = query.where('is_archived', '=', false)
  }

  if (category) {
    const categoryArray = category
      .split(',')
      .map((c) => c.trim())
      .filter((c) => c.length > 0)
    if (categoryArray.length === 1) {
      query = query.where('category', '=', categoryArray[0])
    } else if (categoryArray.length > 1) {
      query = query.where('category', 'in', categoryArray)
    }
  }

  if (search) {
    query = query.where((eb) =>
      eb.or([
        eb('title', 'ilike', `%${search}%`),
        eb('description', 'ilike', `%${search}%`),
        // Simple tag search - check if any tag contains search term
        eb(sql`COALESCE(array_to_string(tags, ','), '')`, 'ilike', `%${search}%`),
      ]),
    )
  }

  if (tags) {
    // Search for documents that contain any of the specified tags
    const tagArray = tags
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0)
    if (tagArray.length > 0) {
      query = query.where((eb) =>
        eb.or(
          tagArray.map((tag) =>
            eb(sql`COALESCE(array_to_string(tags, ','), '')`, 'ilike', `%${tag}%`),
          ),
        ),
      )
    }
  }

  const result = await query.executeTakeFirst()
  return Number(result?.count || 0)
}

export const getDocumentStorageKeyById = async (documentId: number): Promise<string | null> => {
  const record = await connection.db
    .selectFrom('member.documents')
    .select(['storage_key'])
    .where('document_id', '=', documentId)
    .executeTakeFirst()

  return record ? record.storage_key : null
}

export const getDocumentById = async (documentId: number): Promise<Document | null> => {
  const record = await connection.db
    .selectFrom('member.documents')
    .selectAll()
    .where('document_id', '=', documentId)
    .where('is_public', '=', true)
    .executeTakeFirst()

  if (!record) return null

  return {
    documentId: record.document_id,
    title: record.title,
    description: record.description,
    category: record.category,
    documentUrl: record.document_url,
    publishedDate: record.published_date,
    isPublic: record.is_public,
    isArchived: record.is_archived,
    tags: record.tags ?? [],
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

export const addDocument = async (document: Upsert<Document>, jwt: JWTUser): Promise<Document> => {
  const now = new Date()

  const result = await connection.db
    .insertInto('member.documents')
    .values({
      title: document.title,
      description: document.description,
      category: document.category,
      document_url: document.documentUrl,
      published_date: document.publishedDate,
      is_public: document.isPublic ?? true,
      is_archived: document.isArchived ?? false,
      tags: document.tags ?? [],
      file_name: document.fileName,
      file_size: document.fileSize,
      mime_type: document.mimeType,
      storage_key: document.storageKey,
      created_at: now,
      created_by: jwt.memberId,
      updated_at: now,
      updated_by: jwt.memberId,
    })
    .returning('document_id')
    .executeTakeFirst()

  if (!result) {
    return problem({ status: 500, detail: 'Document insert failed' })
  }

  return {
    ...document,
    documentId: result.document_id,
    isPublic: document.isPublic ?? true,
    isArchived: document.isArchived ?? false,
    tags: document.tags ?? [],
    createdAt: now.toISOString(),
    createdBy: jwt.memberId,
    updatedAt: now.toISOString(),
    updatedBy: jwt.memberId,
  }
}

export const updateDocument = async (
  documentId: number,
  patch: Partial<Document>,
  jwt: JWTUser,
): Promise<boolean> => {
  const now = new Date()

  const updateData: any = {
    updated_at: now,
    updated_by: jwt.memberId,
  }

  if (patch.title !== undefined) updateData.title = patch.title
  if (patch.description !== undefined) updateData.description = patch.description
  if (patch.category !== undefined) updateData.category = patch.category
  if (patch.documentUrl !== undefined) updateData.document_url = patch.documentUrl
  if (patch.publishedDate !== undefined) updateData.published_date = patch.publishedDate
  if (patch.isPublic !== undefined) updateData.is_public = patch.isPublic
  if (patch.isArchived !== undefined) updateData.is_archived = patch.isArchived
  if (patch.tags !== undefined) updateData.tags = patch.tags
  if (patch.fileName !== undefined) updateData.file_name = patch.fileName
  if (patch.fileSize !== undefined) updateData.file_size = patch.fileSize
  if (patch.mimeType !== undefined) updateData.mime_type = patch.mimeType
  if (patch.storageKey !== undefined) updateData.storage_key = patch.storageKey

  const result = await connection.db
    .updateTable('member.documents')
    .set(updateData)
    .where('document_id', '=', documentId)
    .executeTakeFirst()

  return result.numUpdatedRows == BigInt(1)
}

export const removeDocument = async (documentId: number): Promise<boolean> => {
  const result = await connection.db
    .deleteFrom('member.documents')
    .where('document_id', '=', documentId)
    .executeTakeFirst()

  return result.numDeletedRows == BigInt(1)
}
