import { db } from './connection.ts'
import type { ProofFile, ProofDocumentCategory } from '@mik/contracts/instructor-qualifications'

function mapProofRow(row: {
  id: number
  member_id: string
  file_name: string
  storage_key: string
  mime_type: string
  uploaded_at: Date
  uploaded_by: string
  history_id: number | string | null
  document_category: string
}): ProofFile {
  return {
    id: row.id,
    memberId: row.member_id,
    fileName: row.file_name,
    storageKey: row.storage_key,
    mimeType: row.mime_type,
    uploadedAt: row.uploaded_at.toISOString(),
    uploadedBy: row.uploaded_by,
    historyId: row.history_id !== null ? Number(row.history_id) : null,
    documentCategory: row.document_category as ProofDocumentCategory,
  }
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
    .insertInto('member.qualification_proof_files')
    .values({
      member_id: memberId,
      file_name: fileName,
      storage_key: storageKey,
      mime_type: mimeType,
      uploaded_by: uploadedBy,
      history_id: historyId,
      document_category: documentCategory,
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  return mapProofRow(row)
}

export async function getQualificationProofs(memberId: string): Promise<ProofFile[]> {
  const rows = await db
    .selectFrom('member.qualification_proof_files')
    .selectAll()
    .where('member_id', '=', memberId)
    .orderBy('uploaded_at', 'desc')
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
    .selectFrom('member.qualification_proof_files')
    .selectAll()
    .where('member_id', '=', memberId)
    .where('document_category', '=', category)
    .where('uploaded_at', '<=', asOf)
    .orderBy('uploaded_at', 'desc')
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
    .selectFrom('member.qualification_proof_files')
    .select(['id', 'member_id', 'document_category', 'uploaded_at'])
    .where('member_id', 'in', memberIds)
    .where('document_category', 'in', ['LICENSE', 'MEDICAL'])
    .where('uploaded_at', '<=', cutoff)
    .orderBy('uploaded_at', 'desc')
    .orderBy('id', 'desc')
    .execute()

  // The rows are sorted desc by uploaded_at, id. For each (member, category) pair,
  // the first row encountered is the most recent — skip subsequent ones.
  const seen = new Set<string>()

  for (const row of rows) {
    const key = `${row.member_id}:${row.document_category}`
    if (seen.has(key)) continue
    seen.add(key)

    const entry = result.get(row.member_id) ?? { licenseProofId: null, medicalProofId: null }
    if (row.document_category === 'LICENSE') {
      entry.licenseProofId = row.id
    } else if (row.document_category === 'MEDICAL') {
      entry.medicalProofId = row.id
    }
    result.set(row.member_id, entry)
  }

  return result
}
