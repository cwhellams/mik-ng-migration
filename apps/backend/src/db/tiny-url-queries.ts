/**
 * Database queries for managing document tiny URLs
 */

import * as connection from './connection.ts'
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
    .insertInto('member.documentTinyUrls')
    .values({
      shortCode: shortCode,
      documentId: params.documentId ?? null,
      aircraftDocumentId: params.aircraftDocumentId ?? null,
      url: params.presignedUrl,
      documentType: documentType,
      expiresAt: expiresAt,
      createdBy: jwt.memberId,
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
): Promise<{ url: string; expiresAt: Date } | null> {
  await connection.db
    .updateTable('member.documentTinyUrls')
    .set((eb) => ({
      accessCount: eb('accessCount', '+', 1),
      lastAccessedAt: new Date(),
    }))
    .where('shortCode', '=', shortCode)
    .execute()

  const record = await connection.db
    .selectFrom('member.documentTinyUrls')
    .select(['url', 'expiresAt'])
    .where('shortCode', '=', shortCode)
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
    .deleteFrom('member.documentTinyUrls')
    .where('expiresAt', '<', new Date())
    .executeTakeFirst()

  return Number(result.numDeletedRows ?? 0)
}
