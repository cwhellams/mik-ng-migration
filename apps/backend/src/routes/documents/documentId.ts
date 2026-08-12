import { DocumentIdSchema } from '@mik/contracts/documents'

import { problem } from '../response.ts'

// Lives here rather than next to DocumentIdSchema in @mik/contracts/documents:
// problem() throws an Express-shaped error, which the contracts package must
// not know about. The schema is the contract; this is the server's reaction to
// it failing.
export function validateDocumentId(
  idString: string | undefined,
): number | ReturnType<typeof problem> {
  if (!idString) {
    return problem({ status: 400, detail: 'Document ID is required' })
  }

  const result = DocumentIdSchema.safeParse(idString)

  if (!result.success) {
    return problem({ status: 400, detail: 'Invalid document ID' })
  }

  return result.data
}
