import 'dotenv/config'

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals'

import { db } from '../../src/db/connection.ts'
import { countDocuments, getAllDocuments } from '../../src/db/document-queries.ts'

/**
 * The module had no tests at all when it was migrated to camelDb (issue #1115,
 * phase 5). These cover the showArchived contract, which is where the list and the
 * count had drifted apart.
 */
describe('document-queries', () => {
  const category = `ut_docs_${Date.now()}`

  beforeAll(async () => {
    await db
      .insertInto('member.documents')
      .values([
        {
          title: 'Active doc',
          category,
          document_url: 'https://example.com/a.pdf',
          is_public: true,
          is_archived: false,
          created_by: 'Matti1',
          updated_by: 'Matti1',
        },
        {
          title: 'Archived doc',
          category,
          document_url: 'https://example.com/b.pdf',
          is_public: true,
          is_archived: true,
          created_by: 'Matti1',
          updated_by: 'Matti1',
        },
      ])
      .execute()
  })

  afterAll(async () => {
    await db.deleteFrom('member.documents').where('category', '=', category).execute()
  })

  it('hides archived documents by default', async () => {
    const docs = await getAllDocuments({ category, showArchived: false })

    expect(docs.map((d) => d.title)).toEqual(['Active doc'])
  })

  // Regression: the list used to filter `isArchived = showArchived`, so this
  // returned *only* the archived document while countDocuments — which has always
  // read showArchived as "include archived" — counted both. The page's total
  // disagreed with the rows under it.
  it('includes archived documents alongside active ones when asked, and agrees with the count', async () => {
    const docs = await getAllDocuments({ category, showArchived: true })
    const total = await countDocuments({ category, showArchived: true })

    expect(docs.map((d) => d.title).sort()).toEqual(['Active doc', 'Archived doc'])
    expect(docs).toHaveLength(total)
  })

  it('agrees with the count in the default case too', async () => {
    const docs = await getAllDocuments({ category, showArchived: false })
    const total = await countDocuments({ category, showArchived: false })

    expect(docs).toHaveLength(total)
  })
})
