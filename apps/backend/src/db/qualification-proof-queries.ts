import { noExtraKeys } from './rowToContract.ts'
import { db } from './connection.ts'
import type { ProofFile, ProofDocumentCategory } from '@mik/contracts/instructor-qualifications'

function mapProofRow(row: {
  id: number
  memberId: string
  fileName: string
  storageKey: string
  mimeType: string
  uploadedAt: Date
  uploadedBy: string
  historyId: number | string | null
  documentCategory: string
}): ProofFile {
  return noExtraKeys({
    ...row,
    uploadedAt: row.uploadedAt.toISOString(),
    historyId: row.historyId !== null ? Number(row.historyId) : null,
    documentCategory: row.documentCategory as ProofDocumentCategory,
  })
}

export async function addQualificationProof(
  memberId: string,
  fileName: string,
  storageKey: string,
  mimeType: string,
  uploadedBy: string,
  historyId: number | null = null,
  documentCategory: ProofDocumentCategory = 'LICENSE',
): Promise<ProofFile> {
  const row = await db
    .insertInto('member.qualificationProofFiles')
    .values({
      memberId: memberId,
      fileName: fileName,
      storageKey: storageKey,
      mimeType: mimeType,
      uploadedBy: uploadedBy,
      historyId: historyId,
      documentCategory: documentCategory,
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  return mapProofRow(row)
}

export async function getQualificationProofs(memberId: string): Promise<ProofFile[]> {
  const rows = await db
    .selectFrom('member.qualificationProofFiles')
    .selectAll()
    .where('memberId', '=', memberId)
    .orderBy('uploadedAt', 'desc')
    .execute()

  return rows.map(mapProofRow)
}

/**
 * Return the most recent proof file of the given category uploaded on or before `asOf`.
 */
export async function getLatestProofByCategory(
  memberId: string,
  category: ProofDocumentCategory,
  asOf: Date,
): Promise<ProofFile | null> {
  const row = await db
    .selectFrom('member.qualificationProofFiles')
    .selectAll()
    .where('memberId', '=', memberId)
    .where('documentCategory', '=', category)
    .where('uploadedAt', '<=', asOf)
    .orderBy('uploadedAt', 'desc')
    .executeTakeFirst()

  return row ? mapProofRow(row) : null
}

export interface MemberProofIds {
  licenseProofId: number | null
  medicalProofId: number | null
}

/**
 * For each member in the list, return the most recent LICENSE and MEDICAL proof
 * file ID uploaded on or before `asOf` (default: now).
 *
 * Fetches all relevant rows for the given members and reduces in JS.
 * The number of proof files per instructor is small, so this is efficient enough.
 *
 * Returns a Map keyed by member_id.
 */
export async function getLatestProofIdsByMembers(
  memberIds: string[],
  asOf?: Date,
): Promise<Map<string, MemberProofIds>> {
  const result = new Map<string, MemberProofIds>()
  if (memberIds.length === 0) return result

  const cutoff = asOf ?? new Date()

  const rows = await db
    .selectFrom('member.qualificationProofFiles')
    .select(['id', 'memberId', 'documentCategory', 'uploadedAt'])
    .where('memberId', 'in', memberIds)
    .where('documentCategory', 'in', ['LICENSE', 'MEDICAL'])
    .where('uploadedAt', '<=', cutoff)
    .orderBy('uploadedAt', 'desc')
    .orderBy('id', 'desc')
    .execute()

  // The rows are sorted desc by uploaded_at, id. For each (member, category) pair,
  // the first row encountered is the most recent — skip subsequent ones.
  const seen = new Set<string>()

  for (const row of rows) {
    const key = `${row.memberId}:${row.documentCategory}`
    if (seen.has(key)) continue
    seen.add(key)

    const entry = result.get(row.memberId) ?? { licenseProofId: null, medicalProofId: null }
    if (row.documentCategory === 'LICENSE') {
      entry.licenseProofId = row.id
    } else if (row.documentCategory === 'MEDICAL') {
      entry.medicalProofId = row.id
    }
    result.set(row.memberId, entry)
  }

  return result
}
