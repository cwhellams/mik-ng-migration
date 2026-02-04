import 'dotenv/config'

import { getTaxReport } from '../../src/db/tax-report-queries.ts'
import type { TaxReportFilters } from '../../src/routes/tax-reports/models.ts'

describe('Tax Report Queries', () => {
  describe('getTaxReport', () => {
    it('should return data for valid date range', async () => {
      const filters: TaxReportFilters = {
        startDate: '2025-01-01',
        endDate: '2025-12-31',
      }

      const result = await getTaxReport(filters)

      expect(Array.isArray(result)).toBe(true)
    })

    it('should return empty array for date range with no flights', async () => {
      const filters: TaxReportFilters = {
        startDate: '2020-01-01',
        endDate: '2020-01-31',
      }

      const result = await getTaxReport(filters)

      expect(result).toEqual([])
    })

    it('should return data with correct structure', async () => {
      const filters: TaxReportFilters = {
        startDate: '2025-01-01',
        endDate: '2025-12-31',
      }

      const result = await getTaxReport(filters)

      if (result.length > 0) {
        const entry = result[0]

        expect(entry).toHaveProperty('month')
        expect(entry).toHaveProperty('aircraftRegistration')
        expect(entry).toHaveProperty('commercialBlockMins')
        expect(entry).toHaveProperty('commercialFlightMins')
        expect(entry).toHaveProperty('privateBlockMins')
        expect(entry).toHaveProperty('privateFlightMins')
        expect(entry).toHaveProperty('totalBlockMins')
        expect(entry).toHaveProperty('totalFlightMins')

        // Verify month format (YYYY-MM)
        expect(entry.month).toMatch(/^\d{4}-\d{2}$/)

        // Verify all values are numbers
        expect(typeof entry.commercialBlockMins).toBe('number')
        expect(typeof entry.commercialFlightMins).toBe('number')
        expect(typeof entry.privateBlockMins).toBe('number')
        expect(typeof entry.privateFlightMins).toBe('number')
        expect(typeof entry.totalBlockMins).toBe('number')
        expect(typeof entry.totalFlightMins).toBe('number')

        // Verify values are non-negative
        expect(entry.commercialBlockMins).toBeGreaterThanOrEqual(0)
        expect(entry.commercialFlightMins).toBeGreaterThanOrEqual(0)
        expect(entry.privateBlockMins).toBeGreaterThanOrEqual(0)
        expect(entry.privateFlightMins).toBeGreaterThanOrEqual(0)
        expect(entry.totalBlockMins).toBeGreaterThanOrEqual(0)
        expect(entry.totalFlightMins).toBeGreaterThanOrEqual(0)

        // Verify totals are sum of commercial and private
        expect(entry.totalBlockMins).toBe(entry.commercialBlockMins + entry.privateBlockMins)
        expect(entry.totalFlightMins).toBe(entry.commercialFlightMins + entry.privateFlightMins)
      }
    })

    it('should group data by month and aircraft', async () => {
      const filters: TaxReportFilters = {
        startDate: '2025-01-01',
        endDate: '2025-12-31',
      }

      const result = await getTaxReport(filters)

      if (result.length > 1) {
        // Check if results are sorted by month and aircraft
        for (let i = 1; i < result.length; i++) {
          const prev = result[i - 1]
          const curr = result[i]

          // Either month should increase or same month with different aircraft
          if (prev.month === curr.month) {
            expect(curr.aircraftRegistration >= prev.aircraftRegistration).toBe(true)
          } else {
            expect(curr.month >= prev.month).toBe(true)
          }
        }

        // Check that each month+aircraft combination is unique
        const combinations = new Set<string>()
        for (const entry of result) {
          const key = `${entry.month}-${entry.aircraftRegistration}`
          expect(combinations.has(key)).toBe(false)
          combinations.add(key)
        }
      }
    })

    it('should filter by date range correctly', async () => {
      const filters: TaxReportFilters = {
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      }

      const result = await getTaxReport(filters)

      // All results should be from January 2025
      for (const entry of result) {
        expect(entry.month).toBe('2025-01')
      }
    })

    it('should handle single day date range', async () => {
      const filters: TaxReportFilters = {
        startDate: '2025-01-15',
        endDate: '2025-01-15',
      }

      const result = await getTaxReport(filters)

      // Should return data or empty array without errors
      expect(Array.isArray(result)).toBe(true)

      // If there are results, they should all be from January 2025
      for (const entry of result) {
        expect(entry.month).toBe('2025-01')
      }
    })

    it('should separate commercial and private flights correctly', async () => {
      const filters: TaxReportFilters = {
        startDate: '2025-01-01',
        endDate: '2025-12-31',
      }

      const result = await getTaxReport(filters)

      // Each entry should have either commercial or private time (or both)
      for (const entry of result) {
        const hasCommercial = entry.commercialBlockMins > 0 || entry.commercialFlightMins > 0
        const hasPrivate = entry.privateBlockMins > 0 || entry.privateFlightMins > 0
        const hasTotal = entry.totalBlockMins > 0 || entry.totalFlightMins > 0

        // If there's a total, there must be either commercial or private data
        if (hasTotal) {
          expect(hasCommercial || hasPrivate).toBe(true)
        }
      }
    })
  })
})
