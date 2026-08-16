import 'dotenv/config'

import { db } from '../../src/db/connection.ts'
import { getOccurrencesPerHundredHrsByAcYr } from '../../src/db/stats-queries.ts'

// Isolated from real occurrence fixtures (which live in 2025) by using a year
// no other test data touches.
const OCCURRENCE_YEAR = 2099
const OCCURRENCE_DATE = `${OCCURRENCE_YEAR}-06-15T10:30:00+00`

describe('stats-queries: occurrences per 100 flight hours', () => {
  const originalId = 'STO1RECV'
  const copyId = 'STO1ANON'
  const deletedId = 'STO1DELD'

  const baseOccurrence = {
    occurrenceDate: OCCURRENCE_DATE,
    reportDate: OCCURRENCE_DATE,
    headline: 'Safety stats test occurrence',
    location: 'EFNU',
    description: 'Test occurrence for safety stats view',
    categories: JSON.stringify(['WILD']),
    isDtoReport: false,
    registration: 'OH-STL',
    createdBy: 'k1mnimda',
    updatedBy: 'k1mnimda',
  }

  beforeAll(async () => {
    // Mirrors the real RECEIVED transition: the original row moves to
    // RECEIVED and links to a new anonymized copy, which links back to it.
    await db
      .insertInto('flight.occurrences')
      .values({
        ...baseOccurrence,
        reportId: originalId,
        status: 'RECEIVED',
      })
      .execute()

    await db
      .insertInto('flight.occurrences')
      .values({
        ...baseOccurrence,
        reportId: copyId,
        status: 'ANONYMIZED',
        linkedReportId: originalId,
      })
      .execute()

    await db
      .updateTable('flight.occurrences')
      .set({ linkedReportId: copyId })
      .where('reportId', '=', originalId)
      .execute()

    await db
      .insertInto('flight.occurrences')
      .values({
        ...baseOccurrence,
        reportId: deletedId,
        status: 'DELETED',
      })
      .execute()
  })

  afterAll(async () => {
    await db
      .deleteFrom('flight.occurrences')
      .where('reportId', 'in', [originalId, copyId, deletedId])
      .execute()
  })

  it('counts a RECEIVED/anonymized-copy pair once, not twice', async () => {
    const rows = await getOccurrencesPerHundredHrsByAcYr({
      aircraftRegistration: 'OH-STL',
      yr: OCCURRENCE_YEAR,
    })

    expect(rows).toHaveLength(1)
    expect(rows[0].occurrenceCount).toBe(1)
  })
})
