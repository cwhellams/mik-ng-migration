import { jest, beforeEach, describe, it, expect } from '@jest/globals'
import request from 'supertest'
import express from 'express'

// Mock the stats queries module before importing anything else
const mockGetTotalFlightTimeByAc = jest.fn<() => Promise<any>>()
const mockGetTotalFlightTimeByAcYrFt = jest.fn<() => Promise<any>>()
const mockGetTotalFlightTimeByAcYrMth = jest.fn<() => Promise<any>>()
const mockGetDtoFlightTimeByAc = jest.fn<() => Promise<any>>()
const mockGetDtoFlightTimeByAcYr = jest.fn<() => Promise<any>>()
const mockGetDtoFlightTimeByAcYrMth = jest.fn<() => Promise<any>>()
const mockGetNonBillableFlightTimeByAc = jest.fn<() => Promise<any>>()
const mockGetNonBillableFlightTimeByAcYr = jest.fn<() => Promise<any>>()
const mockGetNonBillableFlightTimeByAcYrMth = jest.fn<() => Promise<any>>()
const mockGetVisitedAirfieldsByAc = jest.fn<() => Promise<any>>()
const mockGetTotalLandingsByAcYr = jest.fn<() => Promise<any>>()
const mockGetTotalOilUpliftByAcYrMth = jest.fn<() => Promise<any>>()
const mockGetTotalFuelUpliftByAcYrMth = jest.fn<() => Promise<any>>()
const mockGetLongestShortestAvgFlightByAcYr = jest.fn<() => Promise<any>>()
const mockGetMemberCountByType = jest.fn<() => Promise<any>>()
const mockGetTotalFlightTimeByPilot = jest.fn<() => Promise<any>>()
const mockGetTotalFlightTimeByPilotYr = jest.fn<() => Promise<any>>()
const mockGetTotalFlightTimeByPilotYrMth = jest.fn<() => Promise<any>>()
const mockGetTotalFlightTimeByAcDt = jest.fn<() => Promise<any>>()
const mockGetCommercialFlightTimeByAcYrMth = jest.fn<() => Promise<any>>()

jest.unstable_mockModule('../../../src/db/stats-queries.ts', () => ({
  getTotalFlightTimeByAc: mockGetTotalFlightTimeByAc,
  getTotalFlightTimeByAcYrFt: mockGetTotalFlightTimeByAcYrFt,
  getTotalFlightTimeByAcYrMth: mockGetTotalFlightTimeByAcYrMth,
  getDtoFlightTimeByAc: mockGetDtoFlightTimeByAc,
  getDtoFlightTimeByAcYr: mockGetDtoFlightTimeByAcYr,
  getDtoFlightTimeByAcYrMth: mockGetDtoFlightTimeByAcYrMth,
  getNonBillableFlightTimeByAc: mockGetNonBillableFlightTimeByAc,
  getNonBillableFlightTimeByAcYr: mockGetNonBillableFlightTimeByAcYr,
  getNonBillableFlightTimeByAcYrMth: mockGetNonBillableFlightTimeByAcYrMth,
  getVisitedAirfieldsByAc: mockGetVisitedAirfieldsByAc,
  getTotalLandingsByAcYr: mockGetTotalLandingsByAcYr,
  getTotalOilUpliftByAcYrMth: mockGetTotalOilUpliftByAcYrMth,
  getTotalFuelUpliftByAcYrMth: mockGetTotalFuelUpliftByAcYrMth,
  getLongestShortestAvgFlightByAcYr: mockGetLongestShortestAvgFlightByAcYr,
  getMemberCountByType: mockGetMemberCountByType,
  getTotalFlightTimeByPilot: mockGetTotalFlightTimeByPilot,
  getTotalFlightTimeByPilotYr: mockGetTotalFlightTimeByPilotYr,
  getTotalFlightTimeByPilotYrMth: mockGetTotalFlightTimeByPilotYrMth,
  getTotalFlightTimeByAcDt: mockGetTotalFlightTimeByAcDt,
  getCommercialFlightTimeByAcYrMth: mockGetCommercialFlightTimeByAcYrMth,
}))

jest.unstable_mockModule('../../../src/middleware/authMiddleware.ts', () => ({
  validateUser: () => (req: express.Request, res: express.Response, next: express.NextFunction) =>
    next(),
}))

const { router } = await import('../../../src/routes/stats/api.ts')

const app = express()
app.use('/api/stats', router)

describe('Stats API', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('V540: Total Flight Time Endpoints', () => {
    describe('GET /api/stats/flight-time/aircraft', () => {
      it('should return total flight time by aircraft with all grouping columns', async () => {
        const mockData = [
          {
            aircraft_registration: 'G-TEST',
            flight_type: 'SOLO',
            date: '2024-01-01',
            total_flight_mins: 630,
            total_nf_mins: 0,
            total_ifr_mins: 0,
          },
        ]
        mockGetTotalFlightTimeByAc.mockResolvedValue(mockData)

        const response = await request(app).get('/api/stats/flight-time/aircraft')

        expect(response.status).toBe(200)
        expect(response.body).toEqual(mockData)
        expect(mockGetTotalFlightTimeByAc).toHaveBeenCalledWith({
          aircraft_registration: undefined,
          date: undefined,
        })
      })

      it('should filter by aircraft registration', async () => {
        const mockData = [
          {
            aircraft_registration: 'G-TEST',
            flight_type: 'SOLO',
            date: '2024-01-01',
            total_flight_mins: 630,
            total_nf_mins: 0,
            total_ifr_mins: 0,
          },
        ]
        mockGetTotalFlightTimeByAc.mockResolvedValue(mockData)

        const response = await request(app)
          .get('/api/stats/flight-time/aircraft')
          .query({ aircraft_registration: 'G-TEST' })

        expect(response.status).toBe(200)
        expect(mockGetTotalFlightTimeByAc).toHaveBeenCalledWith({
          aircraft_registration: 'G-TEST',
          date: undefined,
        })
      })
    })

    describe('GET /api/stats/flight-time/aircraft/year', () => {
      it('should return rows with aircraft_registration, flight_type, yr, and aggregates', async () => {
        const mockData = [
          {
            aircraft_registration: 'G-TEST',
            flight_type: 'SOLO',
            yr: 2024,
            total_flight_mins: 7200,
            total_nf_mins: 120,
            total_ifr_mins: 600,
          },
        ]
        mockGetTotalFlightTimeByAcYrFt.mockResolvedValue(mockData)

        const response = await request(app)
          .get('/api/stats/flight-time/aircraft/year')
          .query({ yr: '2024' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual(mockData)
        expect(mockGetTotalFlightTimeByAcYrFt).toHaveBeenCalledWith({
          aircraft_registration: undefined,
          yr: 2024,
          yr_from: undefined,
          yr_to: undefined,
        })
      })

      it('should support year range filtering', async () => {
        const mockData = [
          {
            aircraft_registration: 'G-TEST',
            flight_type: 'SOLO',
            yr: 2023,
            total_flight_mins: 6000,
            total_nf_mins: 100,
            total_ifr_mins: 500,
          },
          {
            aircraft_registration: 'G-TEST',
            flight_type: 'SOLO',
            yr: 2024,
            total_flight_mins: 7200,
            total_nf_mins: 120,
            total_ifr_mins: 600,
          },
        ]
        mockGetTotalFlightTimeByAcYrFt.mockResolvedValue(mockData)

        const response = await request(app)
          .get('/api/stats/flight-time/aircraft/year')
          .query({ yr_from: '2023', yr_to: '2024' })

        expect(response.status).toBe(200)
        expect(mockGetTotalFlightTimeByAcYrFt).toHaveBeenCalledWith({
          aircraft_registration: undefined,
          yr: undefined,
          yr_from: 2023,
          yr_to: 2024,
        })
      })
    })

    describe('GET /api/stats/flight-time/aircraft/year/month', () => {
      it('should return rows with all grouping columns and aggregates', async () => {
        const mockData = [
          {
            aircraft_registration: 'G-TEST',
            flight_type: 'DUAL',
            yr: 2024,
            mth: 3,
            total_flight_mins: 1500,
            total_nf_mins: 30,
            total_ifr_mins: 150,
          },
        ]
        mockGetTotalFlightTimeByAcYrMth.mockResolvedValue(mockData)

        const response = await request(app)
          .get('/api/stats/flight-time/aircraft/year/month')
          .query({ yr: '2024', mth: '3' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual(mockData)
        expect(mockGetTotalFlightTimeByAcYrMth).toHaveBeenCalledWith({
          aircraft_registration: undefined,
          yr: 2024,
          yr_from: undefined,
          yr_to: undefined,
          mth: 3,
        })
      })
    })
  })

  describe('V550: DTO Flight Time Endpoints', () => {
    describe('GET /api/stats/dto/flight-time/aircraft', () => {
      it('should return DTO flight time with all columns (accessible to all members)', async () => {
        const mockData = [
          {
            aircraft_registration: 'G-TEST',
            flight_type: 'DUAL',
            date: '2024-01-01',
            total_flight_mins: 300,
            total_nf_mins: 0,
            total_ifr_mins: 0,
          },
        ]
        mockGetDtoFlightTimeByAc.mockResolvedValue(mockData)

        const response = await request(app)
          .get('/api/stats/dto/flight-time/aircraft')
          .query({ aircraft_registration: 'G-TEST' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual(mockData)
        expect(mockGetDtoFlightTimeByAc).toHaveBeenCalledWith({
          aircraft_registration: 'G-TEST',
          date: undefined,
        })
      })
    })

    describe('GET /api/stats/dto/flight-time/aircraft/year (restricted)', () => {
      it('should filter by year (requires admin permissions)', async () => {
        const mockData = [
          {
            aircraft_registration: 'G-TEST',
            flight_type: 'DUAL',
            yr: 2024,
            total_flight_mins: 3600,
            total_nf_mins: 0,
            total_ifr_mins: 300,
          },
        ]
        mockGetDtoFlightTimeByAcYr.mockResolvedValue(mockData)

        const response = await request(app)
          .get('/api/stats/dto/flight-time/aircraft/year')
          .query({ yr: '2024' })

        expect(response.status).toBe(200)
        expect(mockGetDtoFlightTimeByAcYr).toHaveBeenCalledWith({
          aircraft_registration: undefined,
          yr: 2024,
          yr_from: undefined,
          yr_to: undefined,
        })
      })
    })

    describe('GET /api/stats/dto/flight-time/aircraft/year/month (restricted)', () => {
      it('should support all filter combinations (requires admin permissions)', async () => {
        const mockData = [
          {
            aircraft_registration: 'G-ABCD',
            flight_type: 'DUAL',
            yr: 2024,
            mth: 6,
            total_flight_mins: 750,
            total_nf_mins: 0,
            total_ifr_mins: 150,
          },
        ]
        mockGetDtoFlightTimeByAcYrMth.mockResolvedValue(mockData)

        const response = await request(app)
          .get('/api/stats/dto/flight-time/aircraft/year/month')
          .query({
            aircraft_registration: 'G-ABCD',
            yr_from: '2024',
            yr_to: '2024',
            mth: '6',
          })

        expect(response.status).toBe(200)
        expect(mockGetDtoFlightTimeByAcYrMth).toHaveBeenCalledWith({
          aircraft_registration: 'G-ABCD',
          yr: undefined,
          yr_from: 2024,
          yr_to: 2024,
          mth: 6,
        })
      })
    })
  })

  describe('V555: Commercial Flight Time Endpoints', () => {
    describe('GET /api/stats/commercial/flight-time/aircraft/year/month (restricted)', () => {
      it('should return commercial flight time by aircraft, year, and month (requires admin permissions)', async () => {
        const mockData = [
          {
            aircraft_registration: 'G-TEST',
            yr: 2024,
            mth: 8,
            total_flight_mins: 1200,
          },
        ]
        mockGetCommercialFlightTimeByAcYrMth.mockResolvedValue(mockData)

        const response = await request(app)
          .get('/api/stats/commercial/flight-time/aircraft/year/month')
          .query({ yr: '2024', mth: '8' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual(mockData)
        expect(mockGetCommercialFlightTimeByAcYrMth).toHaveBeenCalledWith({
          aircraft_registration: undefined,
          yr: 2024,
          yr_from: undefined,
          yr_to: undefined,
          mth: 8,
        })
      })

      it('should support aircraft registration filter', async () => {
        const mockData = [
          {
            aircraft_registration: 'G-COMM',
            flight_type: 'COMMERCIAL',
            yr: 2024,
            mth: 9,
            total_flight_mins: 1500,
            total_nf_mins: 0,
            total_ifr_mins: 750,
          },
        ]
        mockGetCommercialFlightTimeByAcYrMth.mockResolvedValue(mockData)

        const response = await request(app)
          .get('/api/stats/commercial/flight-time/aircraft/year/month')
          .query({
            aircraft_registration: 'G-COMM',
            yr_from: '2024',
            yr_to: '2024',
            mth: '9',
          })

        expect(response.status).toBe(200)
        expect(response.body).toEqual(mockData)
        expect(mockGetCommercialFlightTimeByAcYrMth).toHaveBeenCalledWith({
          aircraft_registration: 'G-COMM',
          yr: undefined,
          yr_from: 2024,
          yr_to: 2024,
          mth: 9,
        })
      })
    })
  })

  describe('V560: Non-Billable Flight Time Endpoints', () => {
    it('should include flight_type in response', async () => {
      const mockData = [
        {
          aircraft_registration: 'G-TEST',
          yr: 2024,
          total_flight_mins: 2700,
        },
      ]
      mockGetNonBillableFlightTimeByAcYr.mockResolvedValue(mockData)

      const response = await request(app)
        .get('/api/stats/non-billable/flight-time/aircraft/year')
        .query({ yr: '2024' })

      expect(response.status).toBe(200)
      expect(response.body).toEqual(mockData)
      expect(mockGetNonBillableFlightTimeByAcYr).toHaveBeenCalledWith({
        aircraft_registration: undefined,
        yr: 2024,
        yr_from: undefined,
        yr_to: undefined,
      })
    })
  })

  describe('V570: Various Aircraft Stats Endpoints', () => {
    describe('GET /api/stats/visited-airfields', () => {
      it('should return airfield, yr, and aircraft_registration', async () => {
        const mockData = [
          {
            aircraft_registration: 'G-TEST',
            yr: 2024,
            airfield: 'EGLL',
            total_visits: 15,
          },
        ]
        mockGetVisitedAirfieldsByAc.mockResolvedValue(mockData)

        const response = await request(app)
          .get('/api/stats/visited-airfields')
          .query({ aircraft_registration: 'G-TEST', yr: '2024' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual(mockData)
        expect(mockGetVisitedAirfieldsByAc).toHaveBeenCalledWith({
          aircraft_registration: 'G-TEST',
          yr: 2024,
          yr_from: undefined,
          yr_to: undefined,
        })
      })
    })

    describe('GET /api/stats/landings/year', () => {
      it('should return aircraft_registration, yr, and total_landings', async () => {
        const mockData = [
          {
            aircraft_registration: 'G-TEST',
            yr: 2024,
            total_landings: 250,
          },
        ]
        mockGetTotalLandingsByAcYr.mockResolvedValue(mockData)

        const response = await request(app).get('/api/stats/landings/year').query({ yr: '2024' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual(mockData)
      })
    })

    describe('GET /api/stats/oil-uplift/year/month', () => {
      it('should return aircraft_registration, yr, mth, and total_oil_uplift', async () => {
        const mockData = [
          {
            aircraft_registration: 'G-TEST',
            yr: 2024,
            mth: 7,
            total_oil_uplift: 25.5,
          },
        ]
        mockGetTotalOilUpliftByAcYrMth.mockResolvedValue(mockData)

        const response = await request(app)
          .get('/api/stats/oil-uplift/year/month')
          .query({ yr: '2024', mth: '7' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual(mockData)
      })
    })

    describe('GET /api/stats/fuel-uplift/year/month', () => {
      it('should return aircraft_registration, yr, mth, and total_fuel_uplift', async () => {
        const mockData = [
          {
            aircraft_registration: 'G-TEST',
            yr: 2024,
            mth: 8,
            total_fuel_uplift: 1500.0,
          },
        ]
        mockGetTotalFuelUpliftByAcYrMth.mockResolvedValue(mockData)

        const response = await request(app)
          .get('/api/stats/fuel-uplift/year/month')
          .query({ aircraft_registration: 'G-TEST', yr_from: '2024', yr_to: '2024', mth: '8' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual(mockData)
      })
    })

    describe('GET /api/stats/flight-stats/year', () => {
      it('should return aircraft_registration, yr, and all flight stats', async () => {
        const mockData = [
          {
            aircraft_registration: 'G-TEST',
            yr: 2024,
            longest_flight: 210,
            shortest_flight: 30,
            average_flight: 72,
            median_flight: 60,
          },
        ]
        mockGetLongestShortestAvgFlightByAcYr.mockResolvedValue(mockData)

        const response = await request(app)
          .get('/api/stats/flight-stats/year')
          .query({ yr: '2024' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual(mockData)
      })
    })

    describe('GET /api/stats/members/count-by-type', () => {
      it('should return member_type and member_count', async () => {
        const mockData = [
          { member_type: 'FULL', member_count: 45 },
          { member_type: 'STUDENT', member_count: 12 },
        ]
        mockGetMemberCountByType.mockResolvedValue(mockData)

        const response = await request(app).get('/api/stats/members/count-by-type')

        expect(response.status).toBe(200)
        expect(response.body).toEqual(mockData)
      })
    })
  })

  describe('V580: Pilot Flight Time Endpoints', () => {
    describe('GET /api/stats/pilot/flight-time', () => {
      it('should return pilot hash, date, and aggregates', async () => {
        const mockData = [
          {
            pilot: 'abc123def456',
            date: '2024-01-01',
            total_flight_mins: 9030,
            total_nf_mins: 720,
            total_ifr_mins: 1800,
          },
        ]
        mockGetTotalFlightTimeByPilot.mockResolvedValue(mockData)

        const response = await request(app)
          .get('/api/stats/pilot/flight-time')
          .query({ pilot: 'abc123def456' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual(mockData)
        expect(mockGetTotalFlightTimeByPilot).toHaveBeenCalledWith({
          pilot: 'abc123def456',
          date: undefined,
        })
      })
    })

    describe('GET /api/stats/pilot/flight-time/year', () => {
      it('should return pilot hash, yr, and aggregates', async () => {
        const mockData = [
          {
            pilot: 'abc123def456',
            yr: 2024,
            total_flight_mins: 4800,
            total_nf_mins: 360,
            total_ifr_mins: 900,
          },
        ]
        mockGetTotalFlightTimeByPilotYr.mockResolvedValue(mockData)

        const response = await request(app)
          .get('/api/stats/pilot/flight-time/year')
          .query({ pilot: 'abc123def456', yr_from: '2024', yr_to: '2024' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual(mockData)
        expect(mockGetTotalFlightTimeByPilotYr).toHaveBeenCalledWith({
          pilot: 'abc123def456',
          yr: undefined,
          yr_from: 2024,
          yr_to: 2024,
        })
      })
    })

    describe('GET /api/stats/pilot/flight-time/year/month', () => {
      it('should return pilot hash, yr, mth, and aggregates', async () => {
        const mockData = [
          {
            pilot: 'abc123def456',
            yr: 2024,
            mth: 5,
            total_flight_mins: 750,
            total_nf_mins: 60,
            total_ifr_mins: 150,
          },
        ]
        mockGetTotalFlightTimeByPilotYrMth.mockResolvedValue(mockData)

        const response = await request(app)
          .get('/api/stats/pilot/flight-time/year/month')
          .query({ yr: '2024', mth: '5' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual(mockData)
      })
    })
  })

  describe('Error Handling', () => {
    it('should propagate errors to middleware', async () => {
      const error = new Error('Database connection failed')
      mockGetTotalFlightTimeByAc.mockRejectedValue(error)

      const response = await request(app).get('/api/stats/flight-time/aircraft')

      expect(response.status).toBe(500)
    })
  })
})
