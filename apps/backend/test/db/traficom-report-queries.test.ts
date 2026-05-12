import 'dotenv/config'

import { getTraficomReport } from '../../src/db/traficom-report-queries.ts'
import { TraficomReportFilter } from '../../src/routes/traficom-reports/models.ts'

describe('Traficom Report Queries', () => {
  describe('getTraficomReport', () => {
    it('should return an array for a valid year', async () => {
      const result = await getTraficomReport({
        year: 2025,
        filter: TraficomReportFilter.ALL,
      })

      expect(Array.isArray(result)).toBe(true)
    })

    it('should return empty array for a year with no flights', async () => {
      const result = await getTraficomReport({
        year: 1901,
        filter: TraficomReportFilter.ALL,
      })

      expect(result).toEqual([])
    })

    it('should return per-aircraft entries with the expected structure', async () => {
      const result = await getTraficomReport({
        year: 2025,
        filter: TraficomReportFilter.ALL,
      })

      if (result.length > 0) {
        const entry = result[0]

        expect(entry).toHaveProperty('aircraftRegistration')
        expect(entry).toHaveProperty('flights')
        expect(entry).toHaveProperty('landings')
        expect(entry).toHaveProperty('zzzzLandings')
        expect(entry).toHaveProperty('yearTotalFlightMins')
        expect(entry).toHaveProperty('lifetimeTotalFlightMins')
        expect(entry).toHaveProperty('lifetimeTotalLandings')

        // ZZZZ landings can't exceed total landings
        expect(entry.zzzzLandings).toBeLessThanOrEqual(entry.landings)

        // Year total flight mins are bounded by lifetime total
        expect(entry.yearTotalFlightMins).toBeLessThanOrEqual(entry.lifetimeTotalFlightMins)
      }
    })

    it('Private + School filter sums should not exceed All filter sums', async () => {
      const all = await getTraficomReport({
        year: 2025,
        filter: TraficomReportFilter.ALL,
      })
      const priv = await getTraficomReport({
        year: 2025,
        filter: TraficomReportFilter.PRIVATE,
      })
      const school = await getTraficomReport({
        year: 2025,
        filter: TraficomReportFilter.SCHOOL,
      })

      const sumFlights = (rows: typeof all) => rows.reduce((acc, r) => acc + r.flights, 0)

      // Private and School are disjoint subsets of All
      expect(sumFlights(priv) + sumFlights(school)).toBeLessThanOrEqual(sumFlights(all))
    })

    it('DTO + Non-DTO school flights should equal all school flights', async () => {
      const school = await getTraficomReport({
        year: 2025,
        filter: TraficomReportFilter.SCHOOL,
      })
      const dto = await getTraficomReport({
        year: 2025,
        filter: TraficomReportFilter.DTO_SCHOOL,
      })
      const nonDto = await getTraficomReport({
        year: 2025,
        filter: TraficomReportFilter.NON_DTO_SCHOOL,
      })

      const sumFlights = (rows: typeof school) => rows.reduce((acc, r) => acc + r.flights, 0)

      expect(sumFlights(dto) + sumFlights(nonDto)).toBe(sumFlights(school))
    })
  })
})
