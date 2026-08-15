import type { Updateable } from 'kysely'

import type { MemberDocuments } from './schema.camel.d.ts'
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

  let query = connection.camelDb
    .selectFrom('member.documents')
    .selectAll()
    .where('isPublic', '=', true)
    .orderBy('publishedDate', 'desc')
    .orderBy('createdAt', 'desc')

  // showArchived means "include archived as well", not "show only archived" — which
  // is how countDocuments has always read it. The list used to filter
  // `isArchived = showArchived`, so ticking the box on the documents page swapped it
  // to archived-only while `total` still counted everything, and the two disagreed.
  if (!showArchived) {
    query = query.where('isArchived', '=', false)
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

  query = query.limit(limit).offset(offset)

  const records = await query.execute()
  return records.map((record) => ({
    documentId: record.documentId,
    title: record.title,
    description: record.description,
    category: record.category,
    documentUrl: record.documentUrl,
    publishedDate: record.publishedDate,
    isPublic: record.isPublic,
    isArchived: record.isArchived,
    tags: record.tags ?? [],
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

export const countDocuments = async (
  filters: DocumentFilters = { showArchived: false },
): Promise<number> => {
  const { category, search, tags, showArchived = false } = filters

  let query = connection.camelDb
    .selectFrom('member.documents')
    .select((eb) => eb.fn.count('documentId').as('count'))
    .where('isPublic', '=', true)

  // Filter by archive status
  if (!showArchived) {
    query = query.where('isArchived', '=', false)
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
  const record = await connection.camelDb
    .selectFrom('member.documents')
    .select(['storageKey'])
    .where('documentId', '=', documentId)
    .executeTakeFirst()

  return record ? record.storageKey : null
}

export const getDocumentById = async (documentId: number): Promise<Document | null> => {
  const record = await connection.camelDb
    .selectFrom('member.documents')
    .selectAll()
    .where('documentId', '=', documentId)
    .where('isPublic', '=', true)
    .executeTakeFirst()

  if (!record) return null

  return {
    documentId: record.documentId,
    title: record.title,
    description: record.description,
    category: record.category,
    documentUrl: record.documentUrl,
    publishedDate: record.publishedDate,
    isPublic: record.isPublic,
    isArchived: record.isArchived,
    tags: record.tags ?? [],
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

export const addDocument = async (document: Upsert<Document>, jwt: JWTUser): Promise<Document> => {
  const now = new Date()

  const result = await connection.camelDb
    .insertInto('member.documents')
    .values({
      title: document.title,
      description: document.description,
      category: document.category,
      documentUrl: document.documentUrl,
      publishedDate: document.publishedDate,
      isPublic: document.isPublic ?? true,
      isArchived: document.isArchived ?? false,
      tags: document.tags ?? [],
      fileName: document.fileName,
      fileSize: document.fileSize,
      mimeType: document.mimeType,
      storageKey: document.storageKey,
      createdAt: now,
      createdBy: jwt.memberId,
      updatedAt: now,
      updatedBy: jwt.memberId,
    })
    .returning('documentId')
    .executeTakeFirst()

  if (!result) {
    return problem({ status: 500, detail: 'Document insert failed' })
  }

  return {
    ...document,
    documentId: result.documentId,
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

  const updateData: Updateable<MemberDocuments> = {
    updatedAt: now,
    updatedBy: jwt.memberId,
  }

  if (patch.title !== undefined) updateData.title = patch.title
  if (patch.description !== undefined) updateData.description = patch.description
  if (patch.category !== undefined) updateData.category = patch.category
  if (patch.documentUrl !== undefined) updateData.documentUrl = patch.documentUrl
  if (patch.publishedDate !== undefined) updateData.publishedDate = patch.publishedDate
  if (patch.isPublic !== undefined) updateData.isPublic = patch.isPublic
  if (patch.isArchived !== undefined) updateData.isArchived = patch.isArchived
  if (patch.tags !== undefined) updateData.tags = patch.tags
  if (patch.fileName !== undefined) updateData.fileName = patch.fileName
  if (patch.fileSize !== undefined) updateData.fileSize = patch.fileSize
  if (patch.mimeType !== undefined) updateData.mimeType = patch.mimeType
  if (patch.storageKey !== undefined) updateData.storageKey = patch.storageKey

  const result = await connection.camelDb
    .updateTable('member.documents')
    .set(updateData)
    .where('documentId', '=', documentId)
    .executeTakeFirst()

  return result.numUpdatedRows == BigInt(1)
}

export const removeDocument = async (documentId: number): Promise<boolean> => {
  const result = await connection.camelDb
    .deleteFrom('member.documents')
    .where('documentId', '=', documentId)
    .executeTakeFirst()

  return result.numDeletedRows == BigInt(1)
}
