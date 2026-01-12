import { Router, type Request, type Response } from 'express'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '../members/models.ts'
import {
  getTotalFlightTimeByAc,
  getTotalFlightTimeByAcYrFt,
  getTotalFlightTimeByAcYrMth,
  getDtoFlightTimeByAc,
  getDtoFlightTimeByAcYr,
  getDtoFlightTimeByAcYrMth,
  getNonBillableFlightTimeByAc,
  getNonBillableFlightTimeByAcYr,
  getNonBillableFlightTimeByAcYrMth,
  getVisitedAirfieldsByAc,
  getTotalLandingsByAcYr,
  getTotalOilUpliftByAcYrMth,
  getTotalFuelUpliftByAcYrMth,
  getLongestShortestAvgFlightByAcYr,
  getMemberCountByType,
  getTotalFlightTimeByPilot,
  getTotalFlightTimeByPilotYr,
  getTotalFlightTimeByPilotYrMth,
  getTotalFlightTimeByAcDt,
  getCommercialFlightTimeByAcYrMth,
} from '../../db/stats-queries.ts'
import type {
  TotalFlightTimeByAc,
  TotalFlightTimeByAcYrFt,
  TotalFlightTimeByAcYrMth,
  DtoFlightTimeByAc,
  DtoFlightTimeByAcYr,
  DtoFlightTimeByAcYrMth,
  NonBillableFlightTimeByAc,
  NonBillableFlightTimeByAcYr,
  NonBillableFlightTimeByAcYrMth,
  VisitedAirfieldsByAc,
  TotalLandingsByAcYr,
  TotalOilUpliftByAcYrMth,
  TotalFuelUpliftByAcYrMth,
  LongestShortestAvgFlightByAcYr,
  MemberCountByType,
  TotalFlightTimeByPilot,
  TotalFlightTimeByPilotYr,
  TotalFlightTimeByPilotYrMth,
  TotalFlightTimeByAcCalendar,
  CommercialFlightTimeByAcYrMth,
} from './models.ts'

export const router = Router()

router.use(validateUser(MIKPermissions.MEMBER))

router.get('/flight-time/aircraft', async (req: Request, res: Response<TotalFlightTimeByAc[]>) => {
  const { aircraft_registration, date } = req.query
  const data = await getTotalFlightTimeByAc({
    aircraft_registration: aircraft_registration as string | undefined,
    date: date as string | undefined,
  })
  res.status(200).json(data)
})

router.get(
  '/flight-time/aircraft/calendar',
  async (req: Request, res: Response<TotalFlightTimeByAcCalendar[]>) => {
    const data = await getTotalFlightTimeByAcDt({
      date_from: req.query.date_from as string | undefined,
      date_to: req.query.date_to as string | undefined,
    })

    res.status(200).json(Object.values(data))
  },
)

router.get(
  '/flight-time/aircraft/year',
  async (req: Request, res: Response<TotalFlightTimeByAcYrFt[]>) => {
    const { aircraft_registration, yr, yr_from, yr_to } = req.query
    const data = await getTotalFlightTimeByAcYrFt({
      aircraft_registration: aircraft_registration as string | undefined,
      yr: yr ? Number(yr) : undefined,
      yr_from: yr_from ? Number(yr_from) : undefined,
      yr_to: yr_to ? Number(yr_to) : undefined,
    })
    res.status(200).json(data)
  },
)

router.get(
  '/flight-time/aircraft/year/month',
  async (req: Request, res: Response<TotalFlightTimeByAcYrMth[]>) => {
    const { aircraft_registration, yr, yr_from, yr_to, mth } = req.query
    const data = await getTotalFlightTimeByAcYrMth({
      aircraft_registration: aircraft_registration as string | undefined,
      yr: yr ? Number(yr) : undefined,
      yr_from: yr_from ? Number(yr_from) : undefined,
      yr_to: yr_to ? Number(yr_to) : undefined,
      mth: mth ? Number(mth) : undefined,
    })
    res.status(200).json(data)
  },
)

router.get(
  '/dto/flight-time/aircraft',
  async (req: Request, res: Response<DtoFlightTimeByAc[]>) => {
    const { aircraft_registration, date } = req.query
    const data = await getDtoFlightTimeByAc({
      aircraft_registration: aircraft_registration as string | undefined,
      date: date as string | undefined,
    })
    res.status(200).json(data)
  },
)

router.get(
  '/non-billable/flight-time/aircraft',
  async (req: Request, res: Response<NonBillableFlightTimeByAc[]>) => {
    const { aircraft_registration, date } = req.query
    const data = await getNonBillableFlightTimeByAc({
      aircraft_registration: aircraft_registration as string | undefined,
      date: date as string | undefined,
    })
    res.status(200).json(data)
  },
)

router.get(
  '/non-billable/flight-time/aircraft/year',
  async (req: Request, res: Response<NonBillableFlightTimeByAcYr[]>) => {
    const { aircraft_registration, yr, yr_from, yr_to } = req.query
    const data = await getNonBillableFlightTimeByAcYr({
      aircraft_registration: aircraft_registration as string | undefined,
      yr: yr ? Number(yr) : undefined,
      yr_from: yr_from ? Number(yr_from) : undefined,
      yr_to: yr_to ? Number(yr_to) : undefined,
    })
    res.status(200).json(data)
  },
)

router.get(
  '/non-billable/flight-time/aircraft/year/month',
  async (req: Request, res: Response<NonBillableFlightTimeByAcYrMth[]>) => {
    const { aircraft_registration, yr, yr_from, yr_to, mth } = req.query
    const data = await getNonBillableFlightTimeByAcYrMth({
      aircraft_registration: aircraft_registration as string | undefined,
      yr: yr ? Number(yr) : undefined,
      yr_from: yr_from ? Number(yr_from) : undefined,
      yr_to: yr_to ? Number(yr_to) : undefined,
      mth: mth ? Number(mth) : undefined,
    })
    res.status(200).json(data)
  },
)

router.get('/visited-airfields', async (req: Request, res: Response<VisitedAirfieldsByAc[]>) => {
  const { aircraft_registration, yr, yr_from, yr_to } = req.query
  const data = await getVisitedAirfieldsByAc({
    aircraft_registration: aircraft_registration as string | undefined,
    yr: yr ? Number(yr) : undefined,
    yr_from: yr_from ? Number(yr_from) : undefined,
    yr_to: yr_to ? Number(yr_to) : undefined,
  })
  res.status(200).json(data)
})

router.get('/landings/year', async (req: Request, res: Response<TotalLandingsByAcYr[]>) => {
  const { aircraft_registration, yr, yr_from, yr_to } = req.query
  const data = await getTotalLandingsByAcYr({
    aircraft_registration: aircraft_registration as string | undefined,
    yr: yr ? Number(yr) : undefined,
    yr_from: yr_from ? Number(yr_from) : undefined,
    yr_to: yr_to ? Number(yr_to) : undefined,
  })
  res.status(200).json(data)
})

router.get(
  '/oil-uplift/year/month',
  async (req: Request, res: Response<TotalOilUpliftByAcYrMth[]>) => {
    const { aircraft_registration, yr, yr_from, yr_to, mth } = req.query
    const data = await getTotalOilUpliftByAcYrMth({
      aircraft_registration: aircraft_registration as string | undefined,
      yr: yr ? Number(yr) : undefined,
      yr_from: yr_from ? Number(yr_from) : undefined,
      yr_to: yr_to ? Number(yr_to) : undefined,
      mth: mth ? Number(mth) : undefined,
    })
    res.status(200).json(data)
  },
)

router.get(
  '/fuel-uplift/year/month',
  async (req: Request, res: Response<TotalFuelUpliftByAcYrMth[]>) => {
    const { aircraft_registration, yr, yr_from, yr_to, mth } = req.query
    const data = await getTotalFuelUpliftByAcYrMth({
      aircraft_registration: aircraft_registration as string | undefined,
      yr: yr ? Number(yr) : undefined,
      yr_from: yr_from ? Number(yr_from) : undefined,
      yr_to: yr_to ? Number(yr_to) : undefined,
      mth: mth ? Number(mth) : undefined,
    })
    res.status(200).json(data)
  },
)

router.get(
  '/flight-stats/year',
  async (req: Request, res: Response<LongestShortestAvgFlightByAcYr[]>) => {
    const { aircraft_registration, yr, yr_from, yr_to } = req.query
    const data = await getLongestShortestAvgFlightByAcYr({
      aircraft_registration: aircraft_registration as string | undefined,
      yr: yr ? Number(yr) : undefined,
      yr_from: yr_from ? Number(yr_from) : undefined,
      yr_to: yr_to ? Number(yr_to) : undefined,
    })
    res.status(200).json(data)
  },
)

router.get('/members/count-by-type', async (req: Request, res: Response<MemberCountByType[]>) => {
  const data = await getMemberCountByType()
  res.status(200).json(data)
})

router.get('/pilot/flight-time', async (req: Request, res: Response<TotalFlightTimeByPilot[]>) => {
  const { pilot, date } = req.query
  const data = await getTotalFlightTimeByPilot({
    pilot: pilot as string | undefined,
    date: date as string | undefined,
  })
  res.status(200).json(data)
})

router.get(
  '/pilot/flight-time/year',
  async (req: Request, res: Response<TotalFlightTimeByPilotYr[]>) => {
    const { pilot, yr, yr_from, yr_to } = req.query
    const data = await getTotalFlightTimeByPilotYr({
      pilot: pilot as string | undefined,
      yr: yr ? Number(yr) : undefined,
      yr_from: yr_from ? Number(yr_from) : undefined,
      yr_to: yr_to ? Number(yr_to) : undefined,
    })
    res.status(200).json(data)
  },
)

router.get(
  '/pilot/flight-time/year/month',
  async (req: Request, res: Response<TotalFlightTimeByPilotYrMth[]>) => {
    const { pilot, yr, yr_from, yr_to, mth } = req.query
    const data = await getTotalFlightTimeByPilotYrMth({
      pilot: pilot as string | undefined,
      yr: yr ? Number(yr) : undefined,
      yr_from: yr_from ? Number(yr_from) : undefined,
      yr_to: yr_to ? Number(yr_to) : undefined,
      mth: mth ? Number(mth) : undefined,
    })
    res.status(200).json(data)
  },
)

router.use(
  validateUser(
    MIKPermissions.FLIGHTLOG_ADMIN,
    MIKPermissions.AIRCRAFT_ADMIN,
    MIKPermissions.INVOICING_ADMIN,
  ),
)
router.get(
  '/dto/flight-time/aircraft/year',
  async (req: Request, res: Response<DtoFlightTimeByAcYr[]>) => {
    const { aircraft_registration, yr, yr_from, yr_to } = req.query
    const data = await getDtoFlightTimeByAcYr({
      aircraft_registration: aircraft_registration as string | undefined,
      yr: yr ? Number(yr) : undefined,
      yr_from: yr_from ? Number(yr_from) : undefined,
      yr_to: yr_to ? Number(yr_to) : undefined,
    })
    res.status(200).json(data)
  },
)

router.get(
  '/dto/flight-time/aircraft/year/month',
  async (req: Request, res: Response<DtoFlightTimeByAcYrMth[]>) => {
    const { aircraft_registration, yr, yr_from, yr_to, mth } = req.query
    const data = await getDtoFlightTimeByAcYrMth({
      aircraft_registration: aircraft_registration as string | undefined,
      yr: yr ? Number(yr) : undefined,
      yr_from: yr_from ? Number(yr_from) : undefined,
      yr_to: yr_to ? Number(yr_to) : undefined,
      mth: mth ? Number(mth) : undefined,
    })
    res.status(200).json(data)
  },
)

router.get(
  '/commercial/flight-time/aircraft/year/month',
  async (req: Request, res: Response<CommercialFlightTimeByAcYrMth[]>) => {
    const { aircraft_registration, yr, yr_from, yr_to, mth } = req.query
    const data = await getCommercialFlightTimeByAcYrMth({
      aircraft_registration: aircraft_registration as string | undefined,
      yr: yr ? Number(yr) : undefined,
      yr_from: yr_from ? Number(yr_from) : undefined,
      yr_to: yr_to ? Number(yr_to) : undefined,
      mth: mth ? Number(mth) : undefined,
    })
    res.status(200).json(data)
  },
)
