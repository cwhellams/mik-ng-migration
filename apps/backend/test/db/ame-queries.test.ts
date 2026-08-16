import 'dotenv/config'

import { describe, expect, it } from '@jest/globals'

import {
  getAllAmeEntries,
  getApprovedAmeEntries,
  getPendingAmeCount,
  getPendingReviewCounts,
} from '../../src/db/ame-queries.ts'

/**
 * ame-queries had no tests when it was migrated to camelDb (issue #1115, phase 5),
 * and it carries seven raw `sql` fragments — the same combination that let a broken
 * query reach CI green in meeting-queries, where the only two raw-SQL functions were
 * mocked in the route tests.
 *
 * These exercise every code path that contains a fragment: the joined submitter name
 * (`trim(concat(...))`), the `medical_types @> ...` array filter, and the
 * `price asc nulls last` ordering. A camelCase identifier inside any of them fails
 * here with a Postgres "column does not exist" error rather than silently.
 */
describe('ame-queries', () => {
  const filters = { page: 1, pageSize: 20 } as Parameters<typeof getApprovedAmeEntries>[0]

  it('lists approved entries, resolving the joined submitter name', async () => {
    const result = await getApprovedAmeEntries(filters)

    expect(Array.isArray(result.entries)).toBe(true)
    expect(typeof result.total).toBe('number')
    for (const entry of result.entries) {
      // the trim(concat(...)) fragment; a missing key would mean the alias was not mapped
      expect(entry).toHaveProperty('submittedByName')
    }
  })

  it('applies the medical_types array filter', async () => {
    const result = await getApprovedAmeEntries({ ...filters, medicalType: 'EASA_CLASS_2' })

    expect(Array.isArray(result.entries)).toBe(true)
    for (const entry of result.entries) {
      expect(entry.medicalTypes).toContain('EASA_CLASS_2')
    }
  })

  it('orders by price with nulls last', async () => {
    const result = await getApprovedAmeEntries({ ...filters, sort: 'price_asc' })

    const prices = result.entries.map((e) => e.price).filter((p): p is number => p != null)
    expect([...prices]).toEqual([...prices].sort((a, b) => a - b))
  })

  it('lists all entries for an admin, including unapproved', async () => {
    const result = await getAllAmeEntries(filters)

    expect(Array.isArray(result.entries)).toBe(true)
    expect(result.total).toBeGreaterThanOrEqual(result.entries.length)
  })

  it('counts pending entries and pending review work', async () => {
    expect(typeof (await getPendingAmeCount())).toBe('number')

    const counts = await getPendingReviewCounts()
    expect(typeof counts).toBe('object')
    expect(counts).not.toBeNull()
  })
})
