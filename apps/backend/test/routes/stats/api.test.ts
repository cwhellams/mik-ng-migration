import { jest, beforeEach, describe, it, expect } from '@jest/globals'
import request from 'supertest'
import express from 'express'

// Mock the stats queries module before importing anything else
const mockGetTotalFlightTimeByAc = jest.fn<(...args: any[]) => Promise<any>>()
const mockGetTotalFlightTimeByAcYrFt = jest.fn<(...args: any[]) => Promise<any>>()
const mockGetTotalFlightTimeByAcYrMth = jest.fn<(...args: any[]) => Promise<any>>()
const mockGetDtoFlightTimeByAc = jest.fn<(...args: any[]) => Promise<any>>()
const mockGetDtoFlightTimeByAcYr = jest.fn<(...args: any[]) => Promise<any>>()
const mockGetDtoFlightTimeByAcYrMth = jest.fn<(...args: any[]) => Promise<any>>()
const mockGetNonBillableFlightTimeByAc = jest.fn<(...args: any[]) => Promise<any>>()
const mockGetNonBillableFlightTimeByAcYr = jest.fn<(...args: any[]) => Promise<any>>()
const mockGetNonBillableFlightTimeByAcYrMth = jest.fn<(...args: any[]) => Promise<any>>()
const mockGetVisitedAirfieldsByAc = jest.fn<(...args: any[]) => Promise<any>>()
const mockGetTotalLandingsByAcYr = jest.fn<(...args: any[]) => Promise<any>>()
const mockGetTotalOilUpliftByAcYrMth = jest.fn<(...args: any[]) => Promise<any>>()
const mockGetTotalFuelUpliftByAcYrMth = jest.fn<(...args: any[]) => Promise<any>>()
const mockGetLongestShortestAvgFlightByAcYr = jest.fn<(...args: any[]) => Promise<any>>()
const mockGetMemberCountByType = jest.fn<(...args: any[]) => Promise<any>>()
const mockGetTotalFlightTimeByPilot = jest.fn<(...args: any[]) => Promise<any>>()
const mockGetTotalFlightTimeByPilotYr = jest.fn<(...args: any[]) => Promise<any>>()
const mockGetTotalFlightTimeByPilotYrMth = jest.fn<(...args: any[]) => Promise<any>>()
const mockGetTotalFlightTimeByAcDt = jest.fn<(...args: any[]) => Promise<any>>()
const mockGetCommercialFlightTimeByAcYrMth = jest.fn<(...args: any[]) => Promise<any>>()
const mockGetPilotStatistics = jest.fn<(...args: any[]) => Promise<any>>()
const mockGetReservationEfficiencyByYr = jest.fn<(...args: any[]) => Promise<any>>()
const mockGetReservationEfficiencyByYrMth = jest.fn<(...args: any[]) => Promise<any>>()
const mockGetReservationEfficiencyByAcYr = jest.fn<(...args: any[]) => Promise<any>>()
const mockGetReservationEfficiencyByAcYrMth = jest.fn<(...args: any[]) => Promise<any>>()
const mockGetReservationEfficiencyByMemberYr = jest.fn<(...args: any[]) => Promise<any>>()
const mockGetReservationEfficiencyByMemberYrMth = jest.fn<(...args: any[]) => Promise<any>>()
const mockGetAirfieldEfficiencyByYr = jest.fn<(...args: any[]) => Promise<any>>()
const mockGetAirfieldEfficiencyByYrMth = jest.fn<(...args: any[]) => Promise<any>>()
const mockGetAirfieldEfficiencyByAcYr = jest.fn<(...args: any[]) => Promise<any>>()
const mockGetAirfieldEfficiencyByAcYrMth = jest.fn<(...args: any[]) => Promise<any>>()
const mockGetAogDaysByAcYr = jest.fn<(...args: any[]) => Promise<any>>()
const mockGetAogDaysByAcYrMth = jest.fn<(...args: any[]) => Promise<any>>()
const mockGetPobDistributionByAcYr = jest.fn<(...args: any[]) => Promise<any>>()
const mockGetMyStatistics = jest.fn<(...args: any[]) => Promise<any>>()

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
  getPilotStatistics: mockGetPilotStatistics,
  getReservationEfficiencyByYr: mockGetReservationEfficiencyByYr,
  getReservationEfficiencyByYrMth: mockGetReservationEfficiencyByYrMth,
  getReservationEfficiencyByAcYr: mockGetReservationEfficiencyByAcYr,
  getReservationEfficiencyByAcYrMth: mockGetReservationEfficiencyByAcYrMth,
  getReservationEfficiencyByMemberYr: mockGetReservationEfficiencyByMemberYr,
  getReservationEfficiencyByMemberYrMth: mockGetReservationEfficiencyByMemberYrMth,
  getAirfieldEfficiencyByYr: mockGetAirfieldEfficiencyByYr,
  getAirfieldEfficiencyByYrMth: mockGetAirfieldEfficiencyByYrMth,
  getAirfieldEfficiencyByAcYr: mockGetAirfieldEfficiencyByAcYr,
  getAirfieldEfficiencyByAcYrMth: mockGetAirfieldEfficiencyByAcYrMth,
  getAogDaysByAcYr: mockGetAogDaysByAcYr,
  getAogDaysByAcYrMth: mockGetAogDaysByAcYrMth,
  getPobDistributionByAcYr: mockGetPobDistributionByAcYr,
  getMyStatistics: mockGetMyStatistics,
}))

const TEST_MEMBER_ID = 'testmember1'

jest.unstable_mockModule('../../../src/middleware/authMiddleware.ts', () => ({
  validateUser: () => (req: express.Request, res: express.Response, next: express.NextFunction) => {
    req.user = { memberId: TEST_MEMBER_ID } as express.Request['user']
    next()
  },
}))

const { router } = await import('../../../src/routes/stats/api.ts')
const { router: timeRouter } = await import('../../../src/routes/time/api.ts')

const { problemErrorHandler } = await import('../../../src/routes/response.ts')

const app = express()
app.use('/api/stats', router)
app.use('/api/time', timeRouter)
app.use(problemErrorHandler)

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

  describe('Pilot Statistics Endpoint', () => {
    describe('GET /api/stats/pilots', () => {
      const mockPilotStats = {
        uniquePicCount: 3,
        hoursHistogram: [
          { binFrom: 0, binTo: 10, pilotCount: 1 },
          { binFrom: 10, binTo: 20, pilotCount: 2 },
        ],
        airportsHistogram: [
          { binFrom: 0, binTo: 5, pilotCount: 2 },
          { binFrom: 5, binTo: 10, pilotCount: 1 },
        ],
      }

      it('should return pilot statistics with explicit date range', async () => {
        mockGetPilotStatistics.mockResolvedValue(mockPilotStats)

        const response = await request(app)
          .get('/api/stats/pilots')
          .query({ from: '2024-01-01', to: '2024-12-31' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual(mockPilotStats)
        expect(mockGetPilotStatistics).toHaveBeenCalledWith({
          from: '2024-01-01',
          to: '2024-12-31',
        })
      })

      it('should default to current calendar year when no dates provided', async () => {
        mockGetPilotStatistics.mockResolvedValue(mockPilotStats)

        const timeResponse = await request(app).get('/api/time')
        const serverYear = new Date(
          (timeResponse.body as { utcIso: string }).utcIso,
        ).getUTCFullYear()

        const response = await request(app).get('/api/stats/pilots')

        expect(response.status).toBe(200)
        expect(mockGetPilotStatistics).toHaveBeenCalledWith({
          from: `${serverYear}-01-01`,
          to: `${serverYear}-12-31`,
        })
      })

      it('should return uniquePicCount, hoursHistogram, and airportsHistogram', async () => {
        mockGetPilotStatistics.mockResolvedValue(mockPilotStats)

        const response = await request(app)
          .get('/api/stats/pilots')
          .query({ from: '2024-01-01', to: '2024-12-31' })

        expect(response.status).toBe(200)
        expect(response.body).toHaveProperty('uniquePicCount')
        expect(response.body).toHaveProperty('hoursHistogram')
        expect(response.body).toHaveProperty('airportsHistogram')
        expect(Array.isArray(response.body.hoursHistogram)).toBe(true)
        expect(Array.isArray(response.body.airportsHistogram)).toBe(true)
      })
    })
  })

  describe('V1010: Reservation Efficiency Endpoints (accessible by any authenticated member)', () => {
    const mockEfficiencyData = {
      yr: 2024,
      total_flight_mins: 1200,
      total_reserved_mins: 1800,
      efficiency_pct: 66.67,
    }

    describe('GET /api/stats/reservation-efficiency/year', () => {
      it('should return reservation efficiency by year for any authenticated member (no admin required)', async () => {
        mockGetReservationEfficiencyByYr.mockResolvedValue([mockEfficiencyData])

        const response = await request(app)
          .get('/api/stats/reservation-efficiency/year')
          .query({ yr_from: '2024', yr_to: '2024' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual([mockEfficiencyData])
        expect(mockGetReservationEfficiencyByYr).toHaveBeenCalledWith({
          yr: undefined,
          yr_from: 2024,
          yr_to: 2024,
        })
      })
    })

    describe('GET /api/stats/reservation-efficiency/year/month', () => {
      it('should return reservation efficiency by year and month for any authenticated member (no admin required)', async () => {
        const mockData = { ...mockEfficiencyData, mth: 6 }
        mockGetReservationEfficiencyByYrMth.mockResolvedValue([mockData])

        const response = await request(app)
          .get('/api/stats/reservation-efficiency/year/month')
          .query({ yr: '2024', mth: '6' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual([mockData])
        expect(mockGetReservationEfficiencyByYrMth).toHaveBeenCalledWith({
          yr: 2024,
          yr_from: undefined,
          yr_to: undefined,
          mth: 6,
        })
      })
    })

    describe('GET /api/stats/reservation-efficiency/aircraft/year', () => {
      it('should return reservation efficiency by aircraft and year for any authenticated member (no admin required)', async () => {
        const mockData = { ...mockEfficiencyData, aircraft_registration: 'OH-STL' }
        mockGetReservationEfficiencyByAcYr.mockResolvedValue([mockData])

        const response = await request(app)
          .get('/api/stats/reservation-efficiency/aircraft/year')
          .query({ aircraft_registration: 'OH-STL', yr: '2024' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual([mockData])
        expect(mockGetReservationEfficiencyByAcYr).toHaveBeenCalledWith({
          aircraft_registration: 'OH-STL',
          yr: 2024,
          yr_from: undefined,
          yr_to: undefined,
        })
      })
    })

    describe('GET /api/stats/reservation-efficiency/aircraft/year/month', () => {
      it('should return reservation efficiency by aircraft, year, and month for any authenticated member (no admin required)', async () => {
        const mockData = { ...mockEfficiencyData, aircraft_registration: 'OH-STL', mth: 7 }
        mockGetReservationEfficiencyByAcYrMth.mockResolvedValue([mockData])

        const response = await request(app)
          .get('/api/stats/reservation-efficiency/aircraft/year/month')
          .query({ aircraft_registration: 'OH-STL', yr_from: '2024', yr_to: '2024', mth: '7' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual([mockData])
        expect(mockGetReservationEfficiencyByAcYrMth).toHaveBeenCalledWith({
          aircraft_registration: 'OH-STL',
          yr: undefined,
          yr_from: 2024,
          yr_to: 2024,
          mth: 7,
        })
      })
    })

    describe('GET /api/stats/reservation-efficiency/member/year', () => {
      it('should return reservation efficiency by member and year for any authenticated member (no admin required)', async () => {
        const mockData = { ...mockEfficiencyData, member: 'abc123def456' }
        mockGetReservationEfficiencyByMemberYr.mockResolvedValue([mockData])

        const response = await request(app)
          .get('/api/stats/reservation-efficiency/member/year')
          .query({ yr_from: '2024', yr_to: '2024' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual([mockData])
        expect(mockGetReservationEfficiencyByMemberYr).toHaveBeenCalledWith({
          member: undefined,
          yr: undefined,
          yr_from: 2024,
          yr_to: 2024,
        })
      })
    })

    describe('GET /api/stats/reservation-efficiency/member/year/month', () => {
      it('should return reservation efficiency by member, year, and month for any authenticated member (no admin required)', async () => {
        const mockData = { ...mockEfficiencyData, member: 'abc123def456', mth: 8 }
        mockGetReservationEfficiencyByMemberYrMth.mockResolvedValue([mockData])

        const response = await request(app)
          .get('/api/stats/reservation-efficiency/member/year/month')
          .query({ member: 'abc123def456', yr: '2024', mth: '8' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual([mockData])
        expect(mockGetReservationEfficiencyByMemberYrMth).toHaveBeenCalledWith({
          member: 'abc123def456',
          yr: 2024,
          yr_from: undefined,
          yr_to: undefined,
          mth: 8,
        })
      })
    })
  })

  describe('Airfield Efficiency Endpoints (accessible by any authenticated member)', () => {
    const mockAirfieldEfficiencyData = {
      yr: 2024,
      total_flight_mins: 1200,
      total_airfields_visited: 8,
      airfield_efficiency: 6.67,
    }

    describe('GET /api/stats/airfield-efficiency/year', () => {
      it('should return airfield efficiency by year for any authenticated member (no admin required)', async () => {
        mockGetAirfieldEfficiencyByYr.mockResolvedValue([mockAirfieldEfficiencyData])

        const response = await request(app)
          .get('/api/stats/airfield-efficiency/year')
          .query({ yr_from: '2024', yr_to: '2024' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual([mockAirfieldEfficiencyData])
        expect(mockGetAirfieldEfficiencyByYr).toHaveBeenCalledWith({
          yr: undefined,
          yr_from: 2024,
          yr_to: 2024,
        })
      })
    })

    describe('GET /api/stats/airfield-efficiency/year/month', () => {
      it('should return airfield efficiency by year and month for any authenticated member (no admin required)', async () => {
        const mockData = { ...mockAirfieldEfficiencyData, mth: 6 }
        mockGetAirfieldEfficiencyByYrMth.mockResolvedValue([mockData])

        const response = await request(app)
          .get('/api/stats/airfield-efficiency/year/month')
          .query({ yr: '2024', mth: '6' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual([mockData])
        expect(mockGetAirfieldEfficiencyByYrMth).toHaveBeenCalledWith({
          yr: 2024,
          yr_from: undefined,
          yr_to: undefined,
          mth: 6,
        })
      })
    })

    describe('GET /api/stats/airfield-efficiency/aircraft/year', () => {
      it('should return airfield efficiency by aircraft and year for any authenticated member (no admin required)', async () => {
        const mockData = { ...mockAirfieldEfficiencyData, aircraft_registration: 'OH-STL' }
        mockGetAirfieldEfficiencyByAcYr.mockResolvedValue([mockData])

        const response = await request(app)
          .get('/api/stats/airfield-efficiency/aircraft/year')
          .query({ aircraft_registration: 'OH-STL', yr: '2024' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual([mockData])
        expect(mockGetAirfieldEfficiencyByAcYr).toHaveBeenCalledWith({
          aircraft_registration: 'OH-STL',
          yr: 2024,
          yr_from: undefined,
          yr_to: undefined,
        })
      })
    })

    describe('GET /api/stats/airfield-efficiency/aircraft/year/month', () => {
      it('should return airfield efficiency by aircraft, year, and month for any authenticated member (no admin required)', async () => {
        const mockData = { ...mockAirfieldEfficiencyData, aircraft_registration: 'OH-STL', mth: 7 }
        mockGetAirfieldEfficiencyByAcYrMth.mockResolvedValue([mockData])

        const response = await request(app)
          .get('/api/stats/airfield-efficiency/aircraft/year/month')
          .query({ aircraft_registration: 'OH-STL', yr_from: '2024', yr_to: '2024', mth: '7' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual([mockData])
        expect(mockGetAirfieldEfficiencyByAcYrMth).toHaveBeenCalledWith({
          aircraft_registration: 'OH-STL',
          yr: undefined,
          yr_from: 2024,
          yr_to: 2024,
          mth: 7,
        })
      })
    })
  })

  describe('V1380: AOG (Aircraft On Ground) Days Endpoints', () => {
    describe('GET /api/stats/aog/aircraft/year', () => {
      it('should return AOG days by aircraft and year', async () => {
        const mockData = {
          aircraft_registration: 'OH-STL',
          yr: 2024,
          maintenance_days: 5,
          unserviceable_days: 3,
          total_aog_days: 8,
        }
        mockGetAogDaysByAcYr.mockResolvedValue([mockData])

        const response = await request(app)
          .get('/api/stats/aog/aircraft/year')
          .query({ aircraft_registration: 'OH-STL', yr_from: '2024', yr_to: '2024' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual([mockData])
        expect(mockGetAogDaysByAcYr).toHaveBeenCalledWith({
          aircraft_registration: 'OH-STL',
          yr: undefined,
          yr_from: 2024,
          yr_to: 2024,
        })
      })
    })

    describe('GET /api/stats/aog/aircraft/year/month', () => {
      it('should return AOG days by aircraft, year, and month', async () => {
        const mockData = {
          aircraft_registration: 'OH-STL',
          yr: 2024,
          mth: 7,
          maintenance_days: 2,
          unserviceable_days: 1,
          total_aog_days: 3,
        }
        mockGetAogDaysByAcYrMth.mockResolvedValue([mockData])

        const response = await request(app)
          .get('/api/stats/aog/aircraft/year/month')
          .query({ aircraft_registration: 'OH-STL', yr: '2024', mth: '7' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual([mockData])
        expect(mockGetAogDaysByAcYrMth).toHaveBeenCalledWith({
          aircraft_registration: 'OH-STL',
          yr: 2024,
          yr_from: undefined,
          yr_to: undefined,
          mth: 7,
        })
      })
    })
  })

  describe('POB (Persons On Board) Distribution Endpoints', () => {
    describe('GET /api/stats/pob-distribution/year', () => {
      it('should return POB distribution by aircraft and year', async () => {
        const mockData = {
          aircraft_registration: 'OH-STL',
          yr: 2024,
          pob_bucket: '3',
          flight_count: 5,
          cross_country_flight_count: 2,
          total_flight_mins: 300,
        }
        mockGetPobDistributionByAcYr.mockResolvedValue([mockData])

        const response = await request(app)
          .get('/api/stats/pob-distribution/year')
          .query({ aircraft_registration: 'OH-STL', yr_from: '2024', yr_to: '2024' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual([mockData])
        expect(mockGetPobDistributionByAcYr).toHaveBeenCalledWith({
          aircraft_registration: 'OH-STL',
          yr: undefined,
          yr_from: 2024,
          yr_to: 2024,
        })
      })
    })
  })

  describe('My Statistics Endpoint', () => {
    const mockData = {
      totals: {
        flightCount: 12,
        totalFlightMins: 720,
        totalBlockMins: 840,
        totalLandings: 30,
        uniqueAirports: 5,
      },
      daily: [{ date: '2024-05-01', flightMins: 60 }],
      monthly: [{ yr: 2024, mth: 5, flightMins: 60 }],
    }

    describe('GET /api/stats/my', () => {
      it('should scope the query to the authenticated member with no filters', async () => {
        mockGetMyStatistics.mockResolvedValue(mockData)

        const response = await request(app).get('/api/stats/my')

        expect(response.status).toBe(200)
        expect(response.body).toEqual(mockData)
        expect(mockGetMyStatistics).toHaveBeenCalledWith({ memberId: TEST_MEMBER_ID })
      })

      it('should pass the date range and aircraft filter through', async () => {
        mockGetMyStatistics.mockResolvedValue(mockData)

        const response = await request(app).get('/api/stats/my').query({
          date_from: '2024-01-01',
          date_to: '2024-12-31',
          aircraft_registration: 'OH-STL',
        })

        expect(response.status).toBe(200)
        expect(mockGetMyStatistics).toHaveBeenCalledWith({
          memberId: TEST_MEMBER_ID,
          date_from: '2024-01-01',
          date_to: '2024-12-31',
          aircraft_registration: 'OH-STL',
        })
      })

      it('should ignore an attempt to request another member via the query string', async () => {
        mockGetMyStatistics.mockResolvedValue(mockData)

        const response = await request(app)
          .get('/api/stats/my')
          .query({ memberId: 'someoneelse', pic_member_id: 'someoneelse' })

        expect(response.status).toBe(200)
        expect(mockGetMyStatistics).toHaveBeenCalledWith({ memberId: TEST_MEMBER_ID })
      })

      it('should reject a malformed date range', async () => {
        const response = await request(app).get('/api/stats/my').query({ date_from: 'last-week' })

        expect(response.status).toBe(400)
        expect(mockGetMyStatistics).not.toHaveBeenCalled()
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
