/**
 * Database queries for managing document tiny URLs
 */

import * as connection from './connection.ts'
import { sql } from 'kysely'
import type { JWTUser } from '../routes/auth/token.ts'
import { calculateExpiration } from '../services/tinyUrl.ts'
import { generateTinyUrlId } from '../util/nanoId.ts'

export interface CreateTinyUrlParams {
  documentId?: number
  aircraftDocumentId?: number
  documentType: 'member' | 'aircraft'
  presignedUrl: string
}

/**
 * Create a new tiny URL for a document
 * Generates a unique short code and stores it in the database
 *
 * @param params - Parameters for creating the tiny URL
 * @param jwt - User JWT for tracking who created it
 * @returns The created tiny URL record
 */
export async function createTinyUrl(params: CreateTinyUrlParams, jwt: JWTUser): Promise<string> {
  const { documentType } = params

  // Validate parameters
  if (documentType === 'member' && !params.documentId) {
    throw new Error('documentId is required for member documents')
  }
  if (documentType === 'aircraft' && !params.aircraftDocumentId) {
    throw new Error('aircraftDocumentId is required for aircraft documents')
  }

  const shortCode = generateTinyUrlId()
  const expiresAt = calculateExpiration()

  const result = await connection.db
    .insertInto('member.document_tiny_urls')
    .values({
      short_code: shortCode,
      document_id: params.documentId ?? null,
      aircraft_document_id: params.aircraftDocumentId ?? null,
      url: params.presignedUrl,
      document_type: documentType,
      expires_at: expiresAt,
      created_by: jwt.memberId,
    })
    .execute()

  if (!result) {
    throw new Error('Failed to create tiny URL')
  }

  return shortCode
}

/**
 * Get a tiny URL by its short code
 *
 * @param shortCode - The short code to look up
 * @returns The URL record or null if not found
 */
export async function getUrlByShortCode(
  shortCode: string,
): Promise<{ url: string; expires_at: Date } | null> {
  await connection.db
    .updateTable('member.document_tiny_urls')
    .set({
      access_count: sql`access_count + 1`,
      last_accessed_at: new Date(),
    })
    .where('short_code', '=', shortCode)
    .execute()

  const record = await connection.db
    .selectFrom('member.document_tiny_urls')
    .select(['url', 'expires_at'])
    .where('short_code', '=', shortCode)
    .executeTakeFirst()

  if (!record) {
    return null
  }

  return record
}

/**
 * Delete expired tiny URLs (cleanup function)
 * Should be run periodically, e.g., by a cron job or worker
 *
 * @returns Number of deleted records
 */
export async function deleteExpiredTinyUrls(): Promise<number> {
  const result = await connection.db
    .deleteFrom('member.document_tiny_urls')
    .where('expires_at', '<', new Date())
    .executeTakeFirst()

  return Number(result.numDeletedRows ?? 0)
}
