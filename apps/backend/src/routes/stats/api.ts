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
  getPilotStatistics,
  getMyStatistics,
  getReservationEfficiencyByYr,
  getReservationEfficiencyByYrMth,
  getReservationEfficiencyByAcYr,
  getReservationEfficiencyByAcYrMth,
  getReservationEfficiencyByMemberYr,
  getReservationEfficiencyByMemberYrMth,
  getAirfieldEfficiencyByYr,
  getAirfieldEfficiencyByYrMth,
  getAirfieldEfficiencyByAcYr,
  getAirfieldEfficiencyByAcYrMth,
  getAogDaysByAcYrMth,
  getAogDaysByAcYr,
  getPobDistributionByAcYr,
  getOccurrencesPerHundredHrsByAcYr,
} from '../../db/stats-queries.ts'
import { MyStatisticsFilterSchema } from './models.ts'
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
  PilotStatistics,
  MyStatistics,
  ReservationEfficiencyByYr,
  ReservationEfficiencyByYrMth,
  ReservationEfficiencyByAcYr,
  ReservationEfficiencyByAcYrMth,
  ReservationEfficiencyByMemberYr,
  ReservationEfficiencyByMemberYrMth,
  AirfieldEfficiencyByYr,
  AirfieldEfficiencyByYrMth,
  AirfieldEfficiencyByAcYr,
  AirfieldEfficiencyByAcYrMth,
  AogDaysByAcYrMth,
  AogDaysByAcYr,
  PobDistributionByAcYr,
  OccurrencesPerHundredHrsByAcYr,
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

router.get('/pilots', async (req: Request, res: Response<PilotStatistics>) => {
  const currentYear = new Date().getFullYear()
  const defaultFrom = `${currentYear}-01-01`
  const defaultTo = `${currentYear}-12-31`

  const from = (req.query.from as string | undefined) ?? defaultFrom
  const to = (req.query.to as string | undefined) ?? defaultTo

  const data = await getPilotStatistics({ from, to })
  res.status(200).json(data)
})

// Personal statistics for the authenticated member. Self-scoped by construction —
// the member id is taken from the session, never from the query string.
router.get('/my', async (req: Request, res: Response<MyStatistics>) => {
  const filters = MyStatisticsFilterSchema.parse(req.query)
  const data = await getMyStatistics({ memberId: req.user!.memberId, ...filters })
  res.status(200).json(data)
})

// V1010: Reservation Efficiency Routes
router.get(
  '/reservation-efficiency/year',
  async (req: Request, res: Response<ReservationEfficiencyByYr[]>) => {
    const { yr, yr_from, yr_to } = req.query
    const data = await getReservationEfficiencyByYr({
      yr: yr ? Number(yr) : undefined,
      yr_from: yr_from ? Number(yr_from) : undefined,
      yr_to: yr_to ? Number(yr_to) : undefined,
    })
    res.status(200).json(data)
  },
)

router.get(
  '/reservation-efficiency/year/month',
  async (req: Request, res: Response<ReservationEfficiencyByYrMth[]>) => {
    const { yr, yr_from, yr_to, mth } = req.query
    const data = await getReservationEfficiencyByYrMth({
      yr: yr ? Number(yr) : undefined,
      yr_from: yr_from ? Number(yr_from) : undefined,
      yr_to: yr_to ? Number(yr_to) : undefined,
      mth: mth ? Number(mth) : undefined,
    })
    res.status(200).json(data)
  },
)

router.get(
  '/reservation-efficiency/aircraft/year',
  async (req: Request, res: Response<ReservationEfficiencyByAcYr[]>) => {
    const { aircraft_registration, yr, yr_from, yr_to } = req.query
    const data = await getReservationEfficiencyByAcYr({
      aircraft_registration: aircraft_registration as string | undefined,
      yr: yr ? Number(yr) : undefined,
      yr_from: yr_from ? Number(yr_from) : undefined,
      yr_to: yr_to ? Number(yr_to) : undefined,
    })
    res.status(200).json(data)
  },
)

router.get(
  '/reservation-efficiency/aircraft/year/month',
  async (req: Request, res: Response<ReservationEfficiencyByAcYrMth[]>) => {
    const { aircraft_registration, yr, yr_from, yr_to, mth } = req.query
    const data = await getReservationEfficiencyByAcYrMth({
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
  '/reservation-efficiency/member/year',
  async (req: Request, res: Response<ReservationEfficiencyByMemberYr[]>) => {
    const { member, yr, yr_from, yr_to } = req.query
    const data = await getReservationEfficiencyByMemberYr({
      member: member as string | undefined,
      yr: yr ? Number(yr) : undefined,
      yr_from: yr_from ? Number(yr_from) : undefined,
      yr_to: yr_to ? Number(yr_to) : undefined,
    })
    res.status(200).json(data)
  },
)

router.get(
  '/reservation-efficiency/member/year/month',
  async (req: Request, res: Response<ReservationEfficiencyByMemberYrMth[]>) => {
    const { member, yr, yr_from, yr_to, mth } = req.query
    const data = await getReservationEfficiencyByMemberYrMth({
      member: member as string | undefined,
      yr: yr ? Number(yr) : undefined,
      yr_from: yr_from ? Number(yr_from) : undefined,
      yr_to: yr_to ? Number(yr_to) : undefined,
      mth: mth ? Number(mth) : undefined,
    })
    res.status(200).json(data)
  },
)

router.get(
  '/airfield-efficiency/year',
  async (req: Request, res: Response<AirfieldEfficiencyByYr[]>) => {
    const { yr, yr_from, yr_to } = req.query
    const data = await getAirfieldEfficiencyByYr({
      yr: yr ? Number(yr) : undefined,
      yr_from: yr_from ? Number(yr_from) : undefined,
      yr_to: yr_to ? Number(yr_to) : undefined,
    })
    res.status(200).json(data)
  },
)

router.get(
  '/airfield-efficiency/year/month',
  async (req: Request, res: Response<AirfieldEfficiencyByYrMth[]>) => {
    const { yr, yr_from, yr_to, mth } = req.query
    const data = await getAirfieldEfficiencyByYrMth({
      yr: yr ? Number(yr) : undefined,
      yr_from: yr_from ? Number(yr_from) : undefined,
      yr_to: yr_to ? Number(yr_to) : undefined,
      mth: mth ? Number(mth) : undefined,
    })
    res.status(200).json(data)
  },
)

router.get(
  '/airfield-efficiency/aircraft/year',
  async (req: Request, res: Response<AirfieldEfficiencyByAcYr[]>) => {
    const { aircraft_registration, yr, yr_from, yr_to } = req.query
    const data = await getAirfieldEfficiencyByAcYr({
      aircraft_registration: aircraft_registration as string | undefined,
      yr: yr ? Number(yr) : undefined,
      yr_from: yr_from ? Number(yr_from) : undefined,
      yr_to: yr_to ? Number(yr_to) : undefined,
    })
    res.status(200).json(data)
  },
)

router.get(
  '/airfield-efficiency/aircraft/year/month',
  async (req: Request, res: Response<AirfieldEfficiencyByAcYrMth[]>) => {
    const { aircraft_registration, yr, yr_from, yr_to, mth } = req.query
    const data = await getAirfieldEfficiencyByAcYrMth({
      aircraft_registration: aircraft_registration as string | undefined,
      yr: yr ? Number(yr) : undefined,
      yr_from: yr_from ? Number(yr_from) : undefined,
      yr_to: yr_to ? Number(yr_to) : undefined,
      mth: mth ? Number(mth) : undefined,
    })
    res.status(200).json(data)
  },
)

router.get('/aog/aircraft/year', async (req: Request, res: Response<AogDaysByAcYr[]>) => {
  const { aircraft_registration, yr, yr_from, yr_to } = req.query
  const data = await getAogDaysByAcYr({
    aircraft_registration: aircraft_registration as string | undefined,
    yr: yr ? Number(yr) : undefined,
    yr_from: yr_from ? Number(yr_from) : undefined,
    yr_to: yr_to ? Number(yr_to) : undefined,
  })
  res.status(200).json(data)
})

router.get('/aog/aircraft/year/month', async (req: Request, res: Response<AogDaysByAcYrMth[]>) => {
  const { aircraft_registration, yr, yr_from, yr_to, mth } = req.query
  const data = await getAogDaysByAcYrMth({
    aircraft_registration: aircraft_registration as string | undefined,
    yr: yr ? Number(yr) : undefined,
    yr_from: yr_from ? Number(yr_from) : undefined,
    yr_to: yr_to ? Number(yr_to) : undefined,
    mth: mth ? Number(mth) : undefined,
  })
  res.status(200).json(data)
})

router.get(
  '/pob-distribution/year',
  async (req: Request, res: Response<PobDistributionByAcYr[]>) => {
    const { aircraft_registration, yr, yr_from, yr_to } = req.query
    const data = await getPobDistributionByAcYr({
      aircraft_registration: aircraft_registration as string | undefined,
      yr: yr ? Number(yr) : undefined,
      yr_from: yr_from ? Number(yr_from) : undefined,
      yr_to: yr_to ? Number(yr_to) : undefined,
    })
    res.status(200).json(data)
  },
)

router.get(
  '/safety/occurrences-per-100h/aircraft/year',
  async (req: Request, res: Response<OccurrencesPerHundredHrsByAcYr[]>) => {
    const { aircraft_registration, yr, yr_from, yr_to } = req.query
    const data = await getOccurrencesPerHundredHrsByAcYr({
      aircraft_registration: aircraft_registration as string | undefined,
      yr: yr ? Number(yr) : undefined,
      yr_from: yr_from ? Number(yr_from) : undefined,
      yr_to: yr_to ? Number(yr_to) : undefined,
    })
    res.status(200).json(data)
  },
)

// NOTE: routes registered after this point require an admin-tier permission — this
// stricter gate applies to every route below it (Express router.use has no path scoping
// here), so any new MEMBER-accessible endpoint must be registered ABOVE this line.
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
