import 'dotenv/config'
import { sql } from 'kysely'

import { db } from '../../src/db/connection.ts'
import { SIMILARITY_THRESHOLD } from '../../src/db/finding-queries.ts'

/**
 * The findings search leans on the trigram indexes V2150 adds, and whether it
 * actually reaches them is invisible from the results: on a seeded database of
 * a few dozen rows every form of the predicate returns the same answer in the
 * same millisecond, and only starts to matter once the club has years of
 * logbook history.
 *
 * So this asserts the *plan* rather than the result. `enable_seqscan = off`
 * does not force an index -- it makes a sequential scan expensive, and the
 * planner still picks one when there is no alternative. That is exactly the
 * question being asked here: is an index usable for this predicate at all?
 */
const planFor = async (where: ReturnType<typeof sql>): Promise<string> => {
  const rows = await db.transaction().execute(async (trx) => {
    await sql`SELECT set_config('pg_trgm.similarity_threshold', ${String(SIMILARITY_THRESHOLD)}, true)`.execute(
      trx,
    )
    await sql`SET LOCAL enable_seqscan = off`.execute(trx)
    const result = await sql<Record<string, string>>`
      EXPLAIN (COSTS OFF) SELECT d.defect_id FROM flight.defect d WHERE ${where}
    `.execute(trx)
    return result.rows
  })

  // EXPLAIN comes back one row per line, under the key "QUERY PLAN".
  return rows.map((row) => Object.values(row)[0]).join('\n')
}

const TARGET = 'Fuel increasing in the right tank'

describe('trigram index usability', () => {
  it('reaches the trigram index through the % operator', async () => {
    const plan = await planFor(sql`d.description % ${TARGET}`)

    expect(plan).toContain('defect_description_trgm_idx')
    expect(plan).not.toContain('Seq Scan')
  })

  it('cannot reach it through a bare similarity() comparison', async () => {
    // The reason `isSimilar` writes both forms: pg_trgm's GIN opclass indexes
    // the operators, never the function, so this one is a sequential scan
    // however many indexes exist. Should a future Postgres make it indexable,
    // this test fails and the redundant-looking `%` can go.
    const plan = await planFor(
      sql`public.similarity(d.description, ${TARGET}) >= ${SIMILARITY_THRESHOLD}`,
    )

    expect(plan).toContain('Seq Scan')
  })

  it('reaches it for the free-text filter too', async () => {
    // `description ILIKE '%fragment%'` is unindexable without gin_trgm_ops,
    // and the search's `q` filter is exactly that.
    const plan = await planFor(sql`d.description ILIKE ${'%fuel%'}`)

    expect(plan).toContain('defect_description_trgm_idx')
  })
})
