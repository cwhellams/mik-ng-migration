import { Router, type Request, type Response } from 'express'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '@mik/contracts/members'
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
  getSchoolFlightEfficiencyByYr,
  getSchoolFlightEfficiencyByYrMth,
  getSchoolFlightEfficiencyByAcYr,
  getSchoolFlightEfficiencyByAcYrMth,
  getSchoolFlightEfficiencyByInstructorYr,
  getSchoolFlightEfficiencyByInstructorYrMth,
} from '../../db/stats-queries.ts'
import { MyStatisticsFilterSchema } from '@mik/contracts/stats'
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
  SchoolFlightEfficiencyByYr,
  SchoolFlightEfficiencyByYrMth,
  SchoolFlightEfficiencyByAcYr,
  SchoolFlightEfficiencyByAcYrMth,
  SchoolFlightEfficiencyByInstructorYr,
  SchoolFlightEfficiencyByInstructorYrMth,
} from '@mik/contracts/stats'

export const router = Router()

router.use(validateUser(MIKPermissions.MEMBER))

router.get('/flight-time/aircraft', async (req: Request, res: Response<TotalFlightTimeByAc[]>) => {
  const { aircraftRegistration, date } = req.query
  const data = await getTotalFlightTimeByAc({
    aircraftRegistration: aircraftRegistration as string | undefined,
    date: date as string | undefined,
  })
  res.status(200).json(data)
})

router.get(
  '/flight-time/aircraft/calendar',
  async (req: Request, res: Response<TotalFlightTimeByAcCalendar[]>) => {
    const data = await getTotalFlightTimeByAcDt({
      dateFrom: req.query.dateFrom as string | undefined,
      dateTo: req.query.dateTo as string | undefined,
    })

    res.status(200).json(Object.values(data))
  },
)

router.get(
  '/flight-time/aircraft/year',
  async (req: Request, res: Response<TotalFlightTimeByAcYrFt[]>) => {
    const { aircraftRegistration, yr, yrFrom, yrTo } = req.query
    const data = await getTotalFlightTimeByAcYrFt({
      aircraftRegistration: aircraftRegistration as string | undefined,
      yr: yr ? Number(yr) : undefined,
      yrFrom: yrFrom ? Number(yrFrom) : undefined,
      yrTo: yrTo ? Number(yrTo) : undefined,
    })
    res.status(200).json(data)
  },
)

router.get(
  '/flight-time/aircraft/year/month',
  async (req: Request, res: Response<TotalFlightTimeByAcYrMth[]>) => {
    const { aircraftRegistration, yr, yrFrom, yrTo, mth } = req.query
    const data = await getTotalFlightTimeByAcYrMth({
      aircraftRegistration: aircraftRegistration as string | undefined,
      yr: yr ? Number(yr) : undefined,
      yrFrom: yrFrom ? Number(yrFrom) : undefined,
      yrTo: yrTo ? Number(yrTo) : undefined,
      mth: mth ? Number(mth) : undefined,
    })
    res.status(200).json(data)
  },
)

router.get(
  '/dto/flight-time/aircraft',
  async (req: Request, res: Response<DtoFlightTimeByAc[]>) => {
    const { aircraftRegistration, date } = req.query
    const data = await getDtoFlightTimeByAc({
      aircraftRegistration: aircraftRegistration as string | undefined,
      date: date as string | undefined,
    })
    res.status(200).json(data)
  },
)

router.get(
  '/non-billable/flight-time/aircraft',
  async (req: Request, res: Response<NonBillableFlightTimeByAc[]>) => {
    const { aircraftRegistration, date } = req.query
    const data = await getNonBillableFlightTimeByAc({
      aircraftRegistration: aircraftRegistration as string | undefined,
      date: date as string | undefined,
    })
    res.status(200).json(data)
  },
)

router.get(
  '/non-billable/flight-time/aircraft/year',
  async (req: Request, res: Response<NonBillableFlightTimeByAcYr[]>) => {
    const { aircraftRegistration, yr, yrFrom, yrTo } = req.query
    const data = await getNonBillableFlightTimeByAcYr({
      aircraftRegistration: aircraftRegistration as string | undefined,
      yr: yr ? Number(yr) : undefined,
      yrFrom: yrFrom ? Number(yrFrom) : undefined,
      yrTo: yrTo ? Number(yrTo) : undefined,
    })
    res.status(200).json(data)
  },
)

router.get(
  '/non-billable/flight-time/aircraft/year/month',
  async (req: Request, res: Response<NonBillableFlightTimeByAcYrMth[]>) => {
    const { aircraftRegistration, yr, yrFrom, yrTo, mth } = req.query
    const data = await getNonBillableFlightTimeByAcYrMth({
      aircraftRegistration: aircraftRegistration as string | undefined,
      yr: yr ? Number(yr) : undefined,
      yrFrom: yrFrom ? Number(yrFrom) : undefined,
      yrTo: yrTo ? Number(yrTo) : undefined,
      mth: mth ? Number(mth) : undefined,
    })
    res.status(200).json(data)
  },
)

router.get('/visited-airfields', async (req: Request, res: Response<VisitedAirfieldsByAc[]>) => {
  const { aircraftRegistration, yr, yrFrom, yrTo } = req.query
  const data = await getVisitedAirfieldsByAc({
    aircraftRegistration: aircraftRegistration as string | undefined,
    yr: yr ? Number(yr) : undefined,
    yrFrom: yrFrom ? Number(yrFrom) : undefined,
    yrTo: yrTo ? Number(yrTo) : undefined,
  })
  res.status(200).json(data)
})

router.get('/landings/year', async (req: Request, res: Response<TotalLandingsByAcYr[]>) => {
  const { aircraftRegistration, yr, yrFrom, yrTo } = req.query
  const data = await getTotalLandingsByAcYr({
    aircraftRegistration: aircraftRegistration as string | undefined,
    yr: yr ? Number(yr) : undefined,
    yrFrom: yrFrom ? Number(yrFrom) : undefined,
    yrTo: yrTo ? Number(yrTo) : undefined,
  })
  res.status(200).json(data)
})

router.get(
  '/oil-uplift/year/month',
  async (req: Request, res: Response<TotalOilUpliftByAcYrMth[]>) => {
    const { aircraftRegistration, yr, yrFrom, yrTo, mth } = req.query
    const data = await getTotalOilUpliftByAcYrMth({
      aircraftRegistration: aircraftRegistration as string | undefined,
      yr: yr ? Number(yr) : undefined,
      yrFrom: yrFrom ? Number(yrFrom) : undefined,
      yrTo: yrTo ? Number(yrTo) : undefined,
      mth: mth ? Number(mth) : undefined,
    })
    res.status(200).json(data)
  },
)

router.get(
  '/fuel-uplift/year/month',
  async (req: Request, res: Response<TotalFuelUpliftByAcYrMth[]>) => {
    const { aircraftRegistration, yr, yrFrom, yrTo, mth } = req.query
    const data = await getTotalFuelUpliftByAcYrMth({
      aircraftRegistration: aircraftRegistration as string | undefined,
      yr: yr ? Number(yr) : undefined,
      yrFrom: yrFrom ? Number(yrFrom) : undefined,
      yrTo: yrTo ? Number(yrTo) : undefined,
      mth: mth ? Number(mth) : undefined,
    })
    res.status(200).json(data)
  },
)

router.get(
  '/flight-stats/year',
  async (req: Request, res: Response<LongestShortestAvgFlightByAcYr[]>) => {
    const { aircraftRegistration, yr, yrFrom, yrTo } = req.query
    const data = await getLongestShortestAvgFlightByAcYr({
      aircraftRegistration: aircraftRegistration as string | undefined,
      yr: yr ? Number(yr) : undefined,
      yrFrom: yrFrom ? Number(yrFrom) : undefined,
      yrTo: yrTo ? Number(yrTo) : undefined,
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
    const { pilot, yr, yrFrom, yrTo } = req.query
    const data = await getTotalFlightTimeByPilotYr({
      pilot: pilot as string | undefined,
      yr: yr ? Number(yr) : undefined,
      yrFrom: yrFrom ? Number(yrFrom) : undefined,
      yrTo: yrTo ? Number(yrTo) : undefined,
    })
    res.status(200).json(data)
  },
)

router.get(
  '/pilot/flight-time/year/month',
  async (req: Request, res: Response<TotalFlightTimeByPilotYrMth[]>) => {
    const { pilot, yr, yrFrom, yrTo, mth } = req.query
    const data = await getTotalFlightTimeByPilotYrMth({
      pilot: pilot as string | undefined,
      yr: yr ? Number(yr) : undefined,
      yrFrom: yrFrom ? Number(yrFrom) : undefined,
      yrTo: yrTo ? Number(yrTo) : undefined,
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
    const { yr, yrFrom, yrTo } = req.query
    const data = await getReservationEfficiencyByYr({
      yr: yr ? Number(yr) : undefined,
      yrFrom: yrFrom ? Number(yrFrom) : undefined,
      yrTo: yrTo ? Number(yrTo) : undefined,
    })
    res.status(200).json(data)
  },
)

router.get(
  '/reservation-efficiency/year/month',
  async (req: Request, res: Response<ReservationEfficiencyByYrMth[]>) => {
    const { yr, yrFrom, yrTo, mth } = req.query
    const data = await getReservationEfficiencyByYrMth({
      yr: yr ? Number(yr) : undefined,
      yrFrom: yrFrom ? Number(yrFrom) : undefined,
      yrTo: yrTo ? Number(yrTo) : undefined,
      mth: mth ? Number(mth) : undefined,
    })
    res.status(200).json(data)
  },
)

router.get(
  '/reservation-efficiency/aircraft/year',
  async (req: Request, res: Response<ReservationEfficiencyByAcYr[]>) => {
    const { aircraftRegistration, yr, yrFrom, yrTo } = req.query
    const data = await getReservationEfficiencyByAcYr({
      aircraftRegistration: aircraftRegistration as string | undefined,
      yr: yr ? Number(yr) : undefined,
      yrFrom: yrFrom ? Number(yrFrom) : undefined,
      yrTo: yrTo ? Number(yrTo) : undefined,
    })
    res.status(200).json(data)
  },
)

router.get(
  '/reservation-efficiency/aircraft/year/month',
  async (req: Request, res: Response<ReservationEfficiencyByAcYrMth[]>) => {
    const { aircraftRegistration, yr, yrFrom, yrTo, mth } = req.query
    const data = await getReservationEfficiencyByAcYrMth({
      aircraftRegistration: aircraftRegistration as string | undefined,
      yr: yr ? Number(yr) : undefined,
      yrFrom: yrFrom ? Number(yrFrom) : undefined,
      yrTo: yrTo ? Number(yrTo) : undefined,
      mth: mth ? Number(mth) : undefined,
    })
    res.status(200).json(data)
  },
)

router.get(
  '/reservation-efficiency/member/year',
  async (req: Request, res: Response<ReservationEfficiencyByMemberYr[]>) => {
    const { member, yr, yrFrom, yrTo } = req.query
    const data = await getReservationEfficiencyByMemberYr({
      member: member as string | undefined,
      yr: yr ? Number(yr) : undefined,
      yrFrom: yrFrom ? Number(yrFrom) : undefined,
      yrTo: yrTo ? Number(yrTo) : undefined,
    })
    res.status(200).json(data)
  },
)

router.get(
  '/reservation-efficiency/member/year/month',
  async (req: Request, res: Response<ReservationEfficiencyByMemberYrMth[]>) => {
    const { member, yr, yrFrom, yrTo, mth } = req.query
    const data = await getReservationEfficiencyByMemberYrMth({
      member: member as string | undefined,
      yr: yr ? Number(yr) : undefined,
      yrFrom: yrFrom ? Number(yrFrom) : undefined,
      yrTo: yrTo ? Number(yrTo) : undefined,
      mth: mth ? Number(mth) : undefined,
    })
    res.status(200).json(data)
  },
)

router.get(
  '/airfield-efficiency/year',
  async (req: Request, res: Response<AirfieldEfficiencyByYr[]>) => {
    const { yr, yrFrom, yrTo } = req.query
    const data = await getAirfieldEfficiencyByYr({
      yr: yr ? Number(yr) : undefined,
      yrFrom: yrFrom ? Number(yrFrom) : undefined,
      yrTo: yrTo ? Number(yrTo) : undefined,
    })
    res.status(200).json(data)
  },
)

router.get(
  '/airfield-efficiency/year/month',
  async (req: Request, res: Response<AirfieldEfficiencyByYrMth[]>) => {
    const { yr, yrFrom, yrTo, mth } = req.query
    const data = await getAirfieldEfficiencyByYrMth({
      yr: yr ? Number(yr) : undefined,
      yrFrom: yrFrom ? Number(yrFrom) : undefined,
      yrTo: yrTo ? Number(yrTo) : undefined,
      mth: mth ? Number(mth) : undefined,
    })
    res.status(200).json(data)
  },
)

router.get(
  '/airfield-efficiency/aircraft/year',
  async (req: Request, res: Response<AirfieldEfficiencyByAcYr[]>) => {
    const { aircraftRegistration, yr, yrFrom, yrTo } = req.query
    const data = await getAirfieldEfficiencyByAcYr({
      aircraftRegistration: aircraftRegistration as string | undefined,
      yr: yr ? Number(yr) : undefined,
      yrFrom: yrFrom ? Number(yrFrom) : undefined,
      yrTo: yrTo ? Number(yrTo) : undefined,
    })
    res.status(200).json(data)
  },
)

router.get(
  '/airfield-efficiency/aircraft/year/month',
  async (req: Request, res: Response<AirfieldEfficiencyByAcYrMth[]>) => {
    const { aircraftRegistration, yr, yrFrom, yrTo, mth } = req.query
    const data = await getAirfieldEfficiencyByAcYrMth({
      aircraftRegistration: aircraftRegistration as string | undefined,
      yr: yr ? Number(yr) : undefined,
      yrFrom: yrFrom ? Number(yrFrom) : undefined,
      yrTo: yrTo ? Number(yrTo) : undefined,
      mth: mth ? Number(mth) : undefined,
    })
    res.status(200).json(data)
  },
)

// V1760: School Flight Reservation Efficiency Routes
router.get(
  '/school-flight-efficiency/year',
  async (req: Request, res: Response<SchoolFlightEfficiencyByYr[]>) => {
    const { yr, yrFrom, yrTo } = req.query
    const data = await getSchoolFlightEfficiencyByYr({
      yr: yr ? Number(yr) : undefined,
      yrFrom: yrFrom ? Number(yrFrom) : undefined,
      yrTo: yrTo ? Number(yrTo) : undefined,
    })
    res.status(200).json(data)
  },
)

router.get(
  '/school-flight-efficiency/year/month',
  async (req: Request, res: Response<SchoolFlightEfficiencyByYrMth[]>) => {
    const { yr, yrFrom, yrTo, mth } = req.query
    const data = await getSchoolFlightEfficiencyByYrMth({
      yr: yr ? Number(yr) : undefined,
      yrFrom: yrFrom ? Number(yrFrom) : undefined,
      yrTo: yrTo ? Number(yrTo) : undefined,
      mth: mth ? Number(mth) : undefined,
    })
    res.status(200).json(data)
  },
)

router.get(
  '/school-flight-efficiency/aircraft/year',
  async (req: Request, res: Response<SchoolFlightEfficiencyByAcYr[]>) => {
    const { aircraftRegistration, yr, yrFrom, yrTo } = req.query
    const data = await getSchoolFlightEfficiencyByAcYr({
      aircraftRegistration: aircraftRegistration as string | undefined,
      yr: yr ? Number(yr) : undefined,
      yrFrom: yrFrom ? Number(yrFrom) : undefined,
      yrTo: yrTo ? Number(yrTo) : undefined,
    })
    res.status(200).json(data)
  },
)

router.get(
  '/school-flight-efficiency/aircraft/year/month',
  async (req: Request, res: Response<SchoolFlightEfficiencyByAcYrMth[]>) => {
    const { aircraftRegistration, yr, yrFrom, yrTo, mth } = req.query
    const data = await getSchoolFlightEfficiencyByAcYrMth({
      aircraftRegistration: aircraftRegistration as string | undefined,
      yr: yr ? Number(yr) : undefined,
      yrFrom: yrFrom ? Number(yrFrom) : undefined,
      yrTo: yrTo ? Number(yrTo) : undefined,
      mth: mth ? Number(mth) : undefined,
    })
    res.status(200).json(data)
  },
)

router.get(
  '/school-flight-efficiency/instructor/year',
  async (req: Request, res: Response<SchoolFlightEfficiencyByInstructorYr[]>) => {
    const { instructor, yr, yrFrom, yrTo } = req.query
    const data = await getSchoolFlightEfficiencyByInstructorYr({
      instructor: instructor as string | undefined,
      yr: yr ? Number(yr) : undefined,
      yrFrom: yrFrom ? Number(yrFrom) : undefined,
      yrTo: yrTo ? Number(yrTo) : undefined,
    })
    res.status(200).json(data)
  },
)

router.get(
  '/school-flight-efficiency/instructor/year/month',
  async (req: Request, res: Response<SchoolFlightEfficiencyByInstructorYrMth[]>) => {
    const { instructor, yr, yrFrom, yrTo, mth } = req.query
    const data = await getSchoolFlightEfficiencyByInstructorYrMth({
      instructor: instructor as string | undefined,
      yr: yr ? Number(yr) : undefined,
      yrFrom: yrFrom ? Number(yrFrom) : undefined,
      yrTo: yrTo ? Number(yrTo) : undefined,
      mth: mth ? Number(mth) : undefined,
    })
    res.status(200).json(data)
  },
)

router.get('/aog/aircraft/year', async (req: Request, res: Response<AogDaysByAcYr[]>) => {
  const { aircraftRegistration, yr, yrFrom, yrTo } = req.query
  const data = await getAogDaysByAcYr({
    aircraftRegistration: aircraftRegistration as string | undefined,
    yr: yr ? Number(yr) : undefined,
    yrFrom: yrFrom ? Number(yrFrom) : undefined,
    yrTo: yrTo ? Number(yrTo) : undefined,
  })
  res.status(200).json(data)
})

router.get('/aog/aircraft/year/month', async (req: Request, res: Response<AogDaysByAcYrMth[]>) => {
  const { aircraftRegistration, yr, yrFrom, yrTo, mth } = req.query
  const data = await getAogDaysByAcYrMth({
    aircraftRegistration: aircraftRegistration as string | undefined,
    yr: yr ? Number(yr) : undefined,
    yrFrom: yrFrom ? Number(yrFrom) : undefined,
    yrTo: yrTo ? Number(yrTo) : undefined,
    mth: mth ? Number(mth) : undefined,
  })
  res.status(200).json(data)
})

router.get(
  '/pob-distribution/year',
  async (req: Request, res: Response<PobDistributionByAcYr[]>) => {
    const { aircraftRegistration, yr, yrFrom, yrTo } = req.query
    const data = await getPobDistributionByAcYr({
      aircraftRegistration: aircraftRegistration as string | undefined,
      yr: yr ? Number(yr) : undefined,
      yrFrom: yrFrom ? Number(yrFrom) : undefined,
      yrTo: yrTo ? Number(yrTo) : undefined,
    })
    res.status(200).json(data)
  },
)

router.get(
  '/safety/occurrences-per-100h/aircraft/year',
  async (req: Request, res: Response<OccurrencesPerHundredHrsByAcYr[]>) => {
    const { aircraftRegistration, yr, yrFrom, yrTo } = req.query
    const data = await getOccurrencesPerHundredHrsByAcYr({
      aircraftRegistration: aircraftRegistration as string | undefined,
      yr: yr ? Number(yr) : undefined,
      yrFrom: yrFrom ? Number(yrFrom) : undefined,
      yrTo: yrTo ? Number(yrTo) : undefined,
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
    const { aircraftRegistration, yr, yrFrom, yrTo } = req.query
    const data = await getDtoFlightTimeByAcYr({
      aircraftRegistration: aircraftRegistration as string | undefined,
      yr: yr ? Number(yr) : undefined,
      yrFrom: yrFrom ? Number(yrFrom) : undefined,
      yrTo: yrTo ? Number(yrTo) : undefined,
    })
    res.status(200).json(data)
  },
)

router.get(
  '/dto/flight-time/aircraft/year/month',
  async (req: Request, res: Response<DtoFlightTimeByAcYrMth[]>) => {
    const { aircraftRegistration, yr, yrFrom, yrTo, mth } = req.query
    const data = await getDtoFlightTimeByAcYrMth({
      aircraftRegistration: aircraftRegistration as string | undefined,
      yr: yr ? Number(yr) : undefined,
      yrFrom: yrFrom ? Number(yrFrom) : undefined,
      yrTo: yrTo ? Number(yrTo) : undefined,
      mth: mth ? Number(mth) : undefined,
    })
    res.status(200).json(data)
  },
)

router.get(
  '/commercial/flight-time/aircraft/year/month',
  async (req: Request, res: Response<CommercialFlightTimeByAcYrMth[]>) => {
    const { aircraftRegistration, yr, yrFrom, yrTo, mth } = req.query
    const data = await getCommercialFlightTimeByAcYrMth({
      aircraftRegistration: aircraftRegistration as string | undefined,
      yr: yr ? Number(yr) : undefined,
      yrFrom: yrFrom ? Number(yrFrom) : undefined,
      yrTo: yrTo ? Number(yrTo) : undefined,
      mth: mth ? Number(mth) : undefined,
    })
    res.status(200).json(data)
  },
)
