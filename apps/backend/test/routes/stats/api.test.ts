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
const mockGetOccurrencesPerHundredHrsByAcYr = jest.fn<(...args: any[]) => Promise<any>>()
const mockGetMyStatistics = jest.fn<(...args: any[]) => Promise<any>>()
const mockGetSchoolFlightEfficiencyByYr = jest.fn<(...args: any[]) => Promise<any>>()
const mockGetSchoolFlightEfficiencyByYrMth = jest.fn<(...args: any[]) => Promise<any>>()
const mockGetSchoolFlightEfficiencyByAcYr = jest.fn<(...args: any[]) => Promise<any>>()
const mockGetSchoolFlightEfficiencyByAcYrMth = jest.fn<(...args: any[]) => Promise<any>>()
const mockGetSchoolFlightEfficiencyByInstructorYr = jest.fn<(...args: any[]) => Promise<any>>()
const mockGetSchoolFlightEfficiencyByInstructorYrMth = jest.fn<(...args: any[]) => Promise<any>>()

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
  getOccurrencesPerHundredHrsByAcYr: mockGetOccurrencesPerHundredHrsByAcYr,
  getMyStatistics: mockGetMyStatistics,
  getSchoolFlightEfficiencyByYr: mockGetSchoolFlightEfficiencyByYr,
  getSchoolFlightEfficiencyByYrMth: mockGetSchoolFlightEfficiencyByYrMth,
  getSchoolFlightEfficiencyByAcYr: mockGetSchoolFlightEfficiencyByAcYr,
  getSchoolFlightEfficiencyByAcYrMth: mockGetSchoolFlightEfficiencyByAcYrMth,
  getSchoolFlightEfficiencyByInstructorYr: mockGetSchoolFlightEfficiencyByInstructorYr,
  getSchoolFlightEfficiencyByInstructorYrMth: mockGetSchoolFlightEfficiencyByInstructorYrMth,
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
            aircraftRegistration: 'G-TEST',
            flightType: 'SOLO',
            date: '2024-01-01',
            totalFlightMins: 630,
            totalNfMins: 0,
            totalIfrMins: 0,
          },
        ]
        mockGetTotalFlightTimeByAc.mockResolvedValue(mockData)

        const response = await request(app).get('/api/stats/flight-time/aircraft')

        expect(response.status).toBe(200)
        expect(response.body).toEqual(mockData)
        expect(mockGetTotalFlightTimeByAc).toHaveBeenCalledWith({
          aircraftRegistration: undefined,
          date: undefined,
        })
      })

      it('should filter by aircraft registration', async () => {
        const mockData = [
          {
            aircraftRegistration: 'G-TEST',
            flightType: 'SOLO',
            date: '2024-01-01',
            totalFlightMins: 630,
            totalNfMins: 0,
            totalIfrMins: 0,
          },
        ]
        mockGetTotalFlightTimeByAc.mockResolvedValue(mockData)

        const response = await request(app)
          .get('/api/stats/flight-time/aircraft')
          .query({ aircraftRegistration: 'G-TEST' })

        expect(response.status).toBe(200)
        expect(mockGetTotalFlightTimeByAc).toHaveBeenCalledWith({
          aircraftRegistration: 'G-TEST',
          date: undefined,
        })
      })
    })

    describe('GET /api/stats/flight-time/aircraft/year', () => {
      it('should return rows with aircraftRegistration, flightType, yr, and aggregates', async () => {
        const mockData = [
          {
            aircraftRegistration: 'G-TEST',
            flightType: 'SOLO',
            yr: 2024,
            totalFlightMins: 7200,
            totalNfMins: 120,
            totalIfrMins: 600,
          },
        ]
        mockGetTotalFlightTimeByAcYrFt.mockResolvedValue(mockData)

        const response = await request(app)
          .get('/api/stats/flight-time/aircraft/year')
          .query({ yr: '2024' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual(mockData)
        expect(mockGetTotalFlightTimeByAcYrFt).toHaveBeenCalledWith({
          aircraftRegistration: undefined,
          yr: 2024,
          yrFrom: undefined,
          yrTo: undefined,
        })
      })

      it('should support year range filtering', async () => {
        const mockData = [
          {
            aircraftRegistration: 'G-TEST',
            flightType: 'SOLO',
            yr: 2023,
            totalFlightMins: 6000,
            totalNfMins: 100,
            totalIfrMins: 500,
          },
          {
            aircraftRegistration: 'G-TEST',
            flightType: 'SOLO',
            yr: 2024,
            totalFlightMins: 7200,
            totalNfMins: 120,
            totalIfrMins: 600,
          },
        ]
        mockGetTotalFlightTimeByAcYrFt.mockResolvedValue(mockData)

        const response = await request(app)
          .get('/api/stats/flight-time/aircraft/year')
          .query({ yrFrom: '2023', yrTo: '2024' })

        expect(response.status).toBe(200)
        expect(mockGetTotalFlightTimeByAcYrFt).toHaveBeenCalledWith({
          aircraftRegistration: undefined,
          yr: undefined,
          yrFrom: 2023,
          yrTo: 2024,
        })
      })
    })

    describe('GET /api/stats/flight-time/aircraft/year/month', () => {
      it('should return rows with all grouping columns and aggregates', async () => {
        const mockData = [
          {
            aircraftRegistration: 'G-TEST',
            flightType: 'DUAL',
            yr: 2024,
            mth: 3,
            totalFlightMins: 1500,
            totalNfMins: 30,
            totalIfrMins: 150,
          },
        ]
        mockGetTotalFlightTimeByAcYrMth.mockResolvedValue(mockData)

        const response = await request(app)
          .get('/api/stats/flight-time/aircraft/year/month')
          .query({ yr: '2024', mth: '3' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual(mockData)
        expect(mockGetTotalFlightTimeByAcYrMth).toHaveBeenCalledWith({
          aircraftRegistration: undefined,
          yr: 2024,
          yrFrom: undefined,
          yrTo: undefined,
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
            aircraftRegistration: 'G-TEST',
            flightType: 'DUAL',
            date: '2024-01-01',
            totalFlightMins: 300,
            totalNfMins: 0,
            totalIfrMins: 0,
          },
        ]
        mockGetDtoFlightTimeByAc.mockResolvedValue(mockData)

        const response = await request(app)
          .get('/api/stats/dto/flight-time/aircraft')
          .query({ aircraftRegistration: 'G-TEST' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual(mockData)
        expect(mockGetDtoFlightTimeByAc).toHaveBeenCalledWith({
          aircraftRegistration: 'G-TEST',
          date: undefined,
        })
      })
    })

    describe('GET /api/stats/dto/flight-time/aircraft/year (restricted)', () => {
      it('should filter by year (requires admin permissions)', async () => {
        const mockData = [
          {
            aircraftRegistration: 'G-TEST',
            flightType: 'DUAL',
            yr: 2024,
            totalFlightMins: 3600,
            totalNfMins: 0,
            totalIfrMins: 300,
          },
        ]
        mockGetDtoFlightTimeByAcYr.mockResolvedValue(mockData)

        const response = await request(app)
          .get('/api/stats/dto/flight-time/aircraft/year')
          .query({ yr: '2024' })

        expect(response.status).toBe(200)
        expect(mockGetDtoFlightTimeByAcYr).toHaveBeenCalledWith({
          aircraftRegistration: undefined,
          yr: 2024,
          yrFrom: undefined,
          yrTo: undefined,
        })
      })
    })

    describe('GET /api/stats/dto/flight-time/aircraft/year/month (restricted)', () => {
      it('should support all filter combinations (requires admin permissions)', async () => {
        const mockData = [
          {
            aircraftRegistration: 'G-ABCD',
            flightType: 'DUAL',
            yr: 2024,
            mth: 6,
            totalFlightMins: 750,
            totalNfMins: 0,
            totalIfrMins: 150,
          },
        ]
        mockGetDtoFlightTimeByAcYrMth.mockResolvedValue(mockData)

        const response = await request(app)
          .get('/api/stats/dto/flight-time/aircraft/year/month')
          .query({
            aircraftRegistration: 'G-ABCD',
            yrFrom: '2024',
            yrTo: '2024',
            mth: '6',
          })

        expect(response.status).toBe(200)
        expect(mockGetDtoFlightTimeByAcYrMth).toHaveBeenCalledWith({
          aircraftRegistration: 'G-ABCD',
          yr: undefined,
          yrFrom: 2024,
          yrTo: 2024,
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
            aircraftRegistration: 'G-TEST',
            yr: 2024,
            mth: 8,
            totalFlightMins: 1200,
          },
        ]
        mockGetCommercialFlightTimeByAcYrMth.mockResolvedValue(mockData)

        const response = await request(app)
          .get('/api/stats/commercial/flight-time/aircraft/year/month')
          .query({ yr: '2024', mth: '8' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual(mockData)
        expect(mockGetCommercialFlightTimeByAcYrMth).toHaveBeenCalledWith({
          aircraftRegistration: undefined,
          yr: 2024,
          yrFrom: undefined,
          yrTo: undefined,
          mth: 8,
        })
      })

      it('should support aircraft registration filter', async () => {
        const mockData = [
          {
            aircraftRegistration: 'G-COMM',
            flightType: 'COMMERCIAL',
            yr: 2024,
            mth: 9,
            totalFlightMins: 1500,
            totalNfMins: 0,
            totalIfrMins: 750,
          },
        ]
        mockGetCommercialFlightTimeByAcYrMth.mockResolvedValue(mockData)

        const response = await request(app)
          .get('/api/stats/commercial/flight-time/aircraft/year/month')
          .query({
            aircraftRegistration: 'G-COMM',
            yrFrom: '2024',
            yrTo: '2024',
            mth: '9',
          })

        expect(response.status).toBe(200)
        expect(response.body).toEqual(mockData)
        expect(mockGetCommercialFlightTimeByAcYrMth).toHaveBeenCalledWith({
          aircraftRegistration: 'G-COMM',
          yr: undefined,
          yrFrom: 2024,
          yrTo: 2024,
          mth: 9,
        })
      })
    })
  })

  describe('V560: Non-Billable Flight Time Endpoints', () => {
    it('should include flightType in response', async () => {
      const mockData = [
        {
          aircraftRegistration: 'G-TEST',
          yr: 2024,
          totalFlightMins: 2700,
        },
      ]
      mockGetNonBillableFlightTimeByAcYr.mockResolvedValue(mockData)

      const response = await request(app)
        .get('/api/stats/non-billable/flight-time/aircraft/year')
        .query({ yr: '2024' })

      expect(response.status).toBe(200)
      expect(response.body).toEqual(mockData)
      expect(mockGetNonBillableFlightTimeByAcYr).toHaveBeenCalledWith({
        aircraftRegistration: undefined,
        yr: 2024,
        yrFrom: undefined,
        yrTo: undefined,
      })
    })
  })

  describe('V570: Various Aircraft Stats Endpoints', () => {
    describe('GET /api/stats/visited-airfields', () => {
      it('should return airfield, yr, and aircraftRegistration', async () => {
        const mockData = [
          {
            aircraftRegistration: 'G-TEST',
            yr: 2024,
            airfield: 'EGLL',
            totalVisits: 15,
          },
        ]
        mockGetVisitedAirfieldsByAc.mockResolvedValue(mockData)

        const response = await request(app)
          .get('/api/stats/visited-airfields')
          .query({ aircraftRegistration: 'G-TEST', yr: '2024' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual(mockData)
        expect(mockGetVisitedAirfieldsByAc).toHaveBeenCalledWith({
          aircraftRegistration: 'G-TEST',
          yr: 2024,
          yrFrom: undefined,
          yrTo: undefined,
        })
      })
    })

    describe('GET /api/stats/landings/year', () => {
      it('should return aircraftRegistration, yr, and totalLandings', async () => {
        const mockData = [
          {
            aircraftRegistration: 'G-TEST',
            yr: 2024,
            totalLandings: 250,
          },
        ]
        mockGetTotalLandingsByAcYr.mockResolvedValue(mockData)

        const response = await request(app).get('/api/stats/landings/year').query({ yr: '2024' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual(mockData)
      })
    })

    describe('GET /api/stats/oil-uplift/year/month', () => {
      it('should return aircraftRegistration, yr, mth, and totalOilUplift', async () => {
        const mockData = [
          {
            aircraftRegistration: 'G-TEST',
            yr: 2024,
            mth: 7,
            totalOilUplift: 25.5,
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
      it('should return aircraftRegistration, yr, mth, and totalFuelUplift', async () => {
        const mockData = [
          {
            aircraftRegistration: 'G-TEST',
            yr: 2024,
            mth: 8,
            totalFuelUplift: 1500.0,
          },
        ]
        mockGetTotalFuelUpliftByAcYrMth.mockResolvedValue(mockData)

        const response = await request(app)
          .get('/api/stats/fuel-uplift/year/month')
          .query({ aircraftRegistration: 'G-TEST', yrFrom: '2024', yrTo: '2024', mth: '8' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual(mockData)
      })
    })

    describe('GET /api/stats/flight-stats/year', () => {
      it('should return aircraftRegistration, yr, and all flight stats', async () => {
        const mockData = [
          {
            aircraftRegistration: 'G-TEST',
            yr: 2024,
            longestFlight: 210,
            shortestFlight: 30,
            averageFlight: 72,
            medianFlight: 60,
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
      it('should return memberType and memberCount', async () => {
        const mockData = [
          { memberType: 'FULL', memberCount: 45 },
          { memberType: 'STUDENT', memberCount: 12 },
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
            totalFlightMins: 9030,
            totalNfMins: 720,
            totalIfrMins: 1800,
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
            totalFlightMins: 4800,
            totalNfMins: 360,
            totalIfrMins: 900,
          },
        ]
        mockGetTotalFlightTimeByPilotYr.mockResolvedValue(mockData)

        const response = await request(app)
          .get('/api/stats/pilot/flight-time/year')
          .query({ pilot: 'abc123def456', yrFrom: '2024', yrTo: '2024' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual(mockData)
        expect(mockGetTotalFlightTimeByPilotYr).toHaveBeenCalledWith({
          pilot: 'abc123def456',
          yr: undefined,
          yrFrom: 2024,
          yrTo: 2024,
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
            totalFlightMins: 750,
            totalNfMins: 60,
            totalIfrMins: 150,
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
      totalFlightMins: 1200,
      totalReservedMins: 1800,
      efficiencyPct: 66.67,
    }

    describe('GET /api/stats/reservation-efficiency/year', () => {
      it('should return reservation efficiency by year for any authenticated member (no admin required)', async () => {
        mockGetReservationEfficiencyByYr.mockResolvedValue([mockEfficiencyData])

        const response = await request(app)
          .get('/api/stats/reservation-efficiency/year')
          .query({ yrFrom: '2024', yrTo: '2024' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual([mockEfficiencyData])
        expect(mockGetReservationEfficiencyByYr).toHaveBeenCalledWith({
          yr: undefined,
          yrFrom: 2024,
          yrTo: 2024,
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
          yrFrom: undefined,
          yrTo: undefined,
          mth: 6,
        })
      })
    })

    describe('GET /api/stats/reservation-efficiency/aircraft/year', () => {
      it('should return reservation efficiency by aircraft and year for any authenticated member (no admin required)', async () => {
        const mockData = { ...mockEfficiencyData, aircraftRegistration: 'OH-STL' }
        mockGetReservationEfficiencyByAcYr.mockResolvedValue([mockData])

        const response = await request(app)
          .get('/api/stats/reservation-efficiency/aircraft/year')
          .query({ aircraftRegistration: 'OH-STL', yr: '2024' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual([mockData])
        expect(mockGetReservationEfficiencyByAcYr).toHaveBeenCalledWith({
          aircraftRegistration: 'OH-STL',
          yr: 2024,
          yrFrom: undefined,
          yrTo: undefined,
        })
      })
    })

    describe('GET /api/stats/reservation-efficiency/aircraft/year/month', () => {
      it('should return reservation efficiency by aircraft, year, and month for any authenticated member (no admin required)', async () => {
        const mockData = { ...mockEfficiencyData, aircraftRegistration: 'OH-STL', mth: 7 }
        mockGetReservationEfficiencyByAcYrMth.mockResolvedValue([mockData])

        const response = await request(app)
          .get('/api/stats/reservation-efficiency/aircraft/year/month')
          .query({ aircraftRegistration: 'OH-STL', yrFrom: '2024', yrTo: '2024', mth: '7' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual([mockData])
        expect(mockGetReservationEfficiencyByAcYrMth).toHaveBeenCalledWith({
          aircraftRegistration: 'OH-STL',
          yr: undefined,
          yrFrom: 2024,
          yrTo: 2024,
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
          .query({ yrFrom: '2024', yrTo: '2024' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual([mockData])
        expect(mockGetReservationEfficiencyByMemberYr).toHaveBeenCalledWith({
          member: undefined,
          yr: undefined,
          yrFrom: 2024,
          yrTo: 2024,
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
          yrFrom: undefined,
          yrTo: undefined,
          mth: 8,
        })
      })
    })
  })

  describe('V1760: School Flight Reservation Efficiency Endpoints (accessible by any authenticated member)', () => {
    const mockEfficiencyData = {
      yr: 2024,
      totalBlockMins: 900,
      totalReservedMins: 1800,
      efficiencyPct: 50,
    }

    describe('GET /api/stats/school-flight-efficiency/year', () => {
      it('should return school flight efficiency by year for any authenticated member (no admin required)', async () => {
        mockGetSchoolFlightEfficiencyByYr.mockResolvedValue([mockEfficiencyData])

        const response = await request(app)
          .get('/api/stats/school-flight-efficiency/year')
          .query({ yrFrom: '2024', yrTo: '2024' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual([mockEfficiencyData])
        expect(mockGetSchoolFlightEfficiencyByYr).toHaveBeenCalledWith({
          yr: undefined,
          yrFrom: 2024,
          yrTo: 2024,
        })
      })
    })

    describe('GET /api/stats/school-flight-efficiency/year/month', () => {
      it('should return school flight efficiency by year and month for any authenticated member (no admin required)', async () => {
        const mockData = { ...mockEfficiencyData, mth: 6 }
        mockGetSchoolFlightEfficiencyByYrMth.mockResolvedValue([mockData])

        const response = await request(app)
          .get('/api/stats/school-flight-efficiency/year/month')
          .query({ yr: '2024', mth: '6' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual([mockData])
        expect(mockGetSchoolFlightEfficiencyByYrMth).toHaveBeenCalledWith({
          yr: 2024,
          yrFrom: undefined,
          yrTo: undefined,
          mth: 6,
        })
      })
    })

    describe('GET /api/stats/school-flight-efficiency/aircraft/year', () => {
      it('should return school flight efficiency by aircraft and year for any authenticated member (no admin required)', async () => {
        const mockData = { ...mockEfficiencyData, aircraftRegistration: 'OH-STL' }
        mockGetSchoolFlightEfficiencyByAcYr.mockResolvedValue([mockData])

        const response = await request(app)
          .get('/api/stats/school-flight-efficiency/aircraft/year')
          .query({ aircraftRegistration: 'OH-STL', yr: '2024' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual([mockData])
        expect(mockGetSchoolFlightEfficiencyByAcYr).toHaveBeenCalledWith({
          aircraftRegistration: 'OH-STL',
          yr: 2024,
          yrFrom: undefined,
          yrTo: undefined,
        })
      })
    })

    describe('GET /api/stats/school-flight-efficiency/aircraft/year/month', () => {
      it('should return school flight efficiency by aircraft, year, and month for any authenticated member (no admin required)', async () => {
        const mockData = { ...mockEfficiencyData, aircraftRegistration: 'OH-STL', mth: 7 }
        mockGetSchoolFlightEfficiencyByAcYrMth.mockResolvedValue([mockData])

        const response = await request(app)
          .get('/api/stats/school-flight-efficiency/aircraft/year/month')
          .query({ aircraftRegistration: 'OH-STL', yrFrom: '2024', yrTo: '2024', mth: '7' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual([mockData])
        expect(mockGetSchoolFlightEfficiencyByAcYrMth).toHaveBeenCalledWith({
          aircraftRegistration: 'OH-STL',
          yr: undefined,
          yrFrom: 2024,
          yrTo: 2024,
          mth: 7,
        })
      })
    })

    describe('GET /api/stats/school-flight-efficiency/instructor/year', () => {
      it('should return school flight efficiency by instructor and year for any authenticated member (no admin required)', async () => {
        const mockData = { ...mockEfficiencyData, instructor: 'abc123def456' }
        mockGetSchoolFlightEfficiencyByInstructorYr.mockResolvedValue([mockData])

        const response = await request(app)
          .get('/api/stats/school-flight-efficiency/instructor/year')
          .query({ yrFrom: '2024', yrTo: '2024' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual([mockData])
        expect(mockGetSchoolFlightEfficiencyByInstructorYr).toHaveBeenCalledWith({
          instructor: undefined,
          yr: undefined,
          yrFrom: 2024,
          yrTo: 2024,
        })
      })
    })

    describe('GET /api/stats/school-flight-efficiency/instructor/year/month', () => {
      it('should return school flight efficiency by instructor, year, and month for any authenticated member (no admin required)', async () => {
        const mockData = { ...mockEfficiencyData, instructor: 'abc123def456', mth: 8 }
        mockGetSchoolFlightEfficiencyByInstructorYrMth.mockResolvedValue([mockData])

        const response = await request(app)
          .get('/api/stats/school-flight-efficiency/instructor/year/month')
          .query({ instructor: 'abc123def456', yr: '2024', mth: '8' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual([mockData])
        expect(mockGetSchoolFlightEfficiencyByInstructorYrMth).toHaveBeenCalledWith({
          instructor: 'abc123def456',
          yr: 2024,
          yrFrom: undefined,
          yrTo: undefined,
          mth: 8,
        })
      })
    })
  })

  describe('Airfield Efficiency Endpoints (accessible by any authenticated member)', () => {
    const mockAirfieldEfficiencyData = {
      yr: 2024,
      totalFlightMins: 1200,
      total_airfields_visited: 8,
      airfield_efficiency: 6.67,
    }

    describe('GET /api/stats/airfield-efficiency/year', () => {
      it('should return airfield efficiency by year for any authenticated member (no admin required)', async () => {
        mockGetAirfieldEfficiencyByYr.mockResolvedValue([mockAirfieldEfficiencyData])

        const response = await request(app)
          .get('/api/stats/airfield-efficiency/year')
          .query({ yrFrom: '2024', yrTo: '2024' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual([mockAirfieldEfficiencyData])
        expect(mockGetAirfieldEfficiencyByYr).toHaveBeenCalledWith({
          yr: undefined,
          yrFrom: 2024,
          yrTo: 2024,
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
          yrFrom: undefined,
          yrTo: undefined,
          mth: 6,
        })
      })
    })

    describe('GET /api/stats/airfield-efficiency/aircraft/year', () => {
      it('should return airfield efficiency by aircraft and year for any authenticated member (no admin required)', async () => {
        const mockData = { ...mockAirfieldEfficiencyData, aircraftRegistration: 'OH-STL' }
        mockGetAirfieldEfficiencyByAcYr.mockResolvedValue([mockData])

        const response = await request(app)
          .get('/api/stats/airfield-efficiency/aircraft/year')
          .query({ aircraftRegistration: 'OH-STL', yr: '2024' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual([mockData])
        expect(mockGetAirfieldEfficiencyByAcYr).toHaveBeenCalledWith({
          aircraftRegistration: 'OH-STL',
          yr: 2024,
          yrFrom: undefined,
          yrTo: undefined,
        })
      })
    })

    describe('GET /api/stats/airfield-efficiency/aircraft/year/month', () => {
      it('should return airfield efficiency by aircraft, year, and month for any authenticated member (no admin required)', async () => {
        const mockData = { ...mockAirfieldEfficiencyData, aircraftRegistration: 'OH-STL', mth: 7 }
        mockGetAirfieldEfficiencyByAcYrMth.mockResolvedValue([mockData])

        const response = await request(app)
          .get('/api/stats/airfield-efficiency/aircraft/year/month')
          .query({ aircraftRegistration: 'OH-STL', yrFrom: '2024', yrTo: '2024', mth: '7' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual([mockData])
        expect(mockGetAirfieldEfficiencyByAcYrMth).toHaveBeenCalledWith({
          aircraftRegistration: 'OH-STL',
          yr: undefined,
          yrFrom: 2024,
          yrTo: 2024,
          mth: 7,
        })
      })
    })
  })

  describe('V1380: AOG (Aircraft On Ground) Days Endpoints', () => {
    describe('GET /api/stats/aog/aircraft/year', () => {
      it('should return AOG days by aircraft and year', async () => {
        const mockData = {
          aircraftRegistration: 'OH-STL',
          yr: 2024,
          maintenanceDays: 5,
          unserviceableDays: 3,
          totalAogDays: 8,
        }
        mockGetAogDaysByAcYr.mockResolvedValue([mockData])

        const response = await request(app)
          .get('/api/stats/aog/aircraft/year')
          .query({ aircraftRegistration: 'OH-STL', yrFrom: '2024', yrTo: '2024' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual([mockData])
        expect(mockGetAogDaysByAcYr).toHaveBeenCalledWith({
          aircraftRegistration: 'OH-STL',
          yr: undefined,
          yrFrom: 2024,
          yrTo: 2024,
        })
      })
    })

    describe('GET /api/stats/aog/aircraft/year/month', () => {
      it('should return AOG days by aircraft, year, and month', async () => {
        const mockData = {
          aircraftRegistration: 'OH-STL',
          yr: 2024,
          mth: 7,
          maintenanceDays: 2,
          unserviceableDays: 1,
          totalAogDays: 3,
        }
        mockGetAogDaysByAcYrMth.mockResolvedValue([mockData])

        const response = await request(app)
          .get('/api/stats/aog/aircraft/year/month')
          .query({ aircraftRegistration: 'OH-STL', yr: '2024', mth: '7' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual([mockData])
        expect(mockGetAogDaysByAcYrMth).toHaveBeenCalledWith({
          aircraftRegistration: 'OH-STL',
          yr: 2024,
          yrFrom: undefined,
          yrTo: undefined,
          mth: 7,
        })
      })
    })
  })

  describe('POB (Persons On Board) Distribution Endpoints', () => {
    describe('GET /api/stats/pob-distribution/year', () => {
      it('should return POB distribution by aircraft and year', async () => {
        const mockData = {
          aircraftRegistration: 'OH-STL',
          yr: 2024,
          pobBucket: '3',
          flightCount: 5,
          crossCountryFlightCount: 2,
          totalFlightMins: 300,
        }
        mockGetPobDistributionByAcYr.mockResolvedValue([mockData])

        const response = await request(app)
          .get('/api/stats/pob-distribution/year')
          .query({ aircraftRegistration: 'OH-STL', yrFrom: '2024', yrTo: '2024' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual([mockData])
        expect(mockGetPobDistributionByAcYr).toHaveBeenCalledWith({
          aircraftRegistration: 'OH-STL',
          yr: undefined,
          yrFrom: 2024,
          yrTo: 2024,
        })
      })
    })
  })

  describe('V1680: Safety Performance Indicator Endpoints', () => {
    describe('GET /api/stats/safety/occurrences-per-100h/aircraft/year', () => {
      it('should return occurrences per 100 flight hours by aircraft and year', async () => {
        const mockData = {
          aircraftRegistration: 'OH-STL',
          yr: 2024,
          occurrenceCount: 4,
          totalFlightMins: 2385,
          occurrencesPer100h: 10.06,
        }
        mockGetOccurrencesPerHundredHrsByAcYr.mockResolvedValue([mockData])

        const response = await request(app)
          .get('/api/stats/safety/occurrences-per-100h/aircraft/year')
          .query({ aircraftRegistration: 'OH-STL', yrFrom: '2024', yrTo: '2024' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual([mockData])
        expect(mockGetOccurrencesPerHundredHrsByAcYr).toHaveBeenCalledWith({
          aircraftRegistration: 'OH-STL',
          yr: undefined,
          yrFrom: 2024,
          yrTo: 2024,
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
          dateFrom: '2024-01-01',
          dateTo: '2024-12-31',
          aircraftRegistration: 'OH-STL',
        })

        expect(response.status).toBe(200)
        expect(mockGetMyStatistics).toHaveBeenCalledWith({
          memberId: TEST_MEMBER_ID,
          dateFrom: '2024-01-01',
          dateTo: '2024-12-31',
          aircraftRegistration: 'OH-STL',
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
        const response = await request(app).get('/api/stats/my').query({ dateFrom: 'last-week' })

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
