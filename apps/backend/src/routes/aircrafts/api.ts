import dayjs from 'dayjs'
import { Router, type Request, type Response } from 'express'

import {
  AircraftFiltersSchema,
  AircraftSchema,
  type Aircraft,
  type AircraftFilters,
  type AircraftListResponse,
  type AircraftStatus,
} from './models.ts'
import {
  getAllAircraft,
  getAircraftByRegistration,
  updateAircraft,
  addAircraft,
  removeAircraft,
} from '../../db/aircraft-queries.ts'
import { getFlightLogs, getFlightLogTotals } from '../../db/flight-log-queries.ts'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { UpsertSchema } from '../../types/schema.ts'
import type { JWTUser } from '../auth/token.ts'
import { MIKPermissions } from '../members/models.ts'
import { problem } from '../response.ts'
import type { FlightLogListEntry } from '../flight-log/models.ts'
import { getAircraftRegistrations } from '../../db/aircraft-document-queries.ts'

// all aircarft routes are protected by aircraft permissions
export const router = Router()
router.use(validateUser(MIKPermissions.AIRCRAFT_USER, MIKPermissions.AIRCRAFT_ADMIN))

const isAircraftAdmin = (user?: JWTUser): boolean =>
  user?.permissions?.includes(MIKPermissions.AIRCRAFT_ADMIN) ?? false

// Get all aircraft
router.get('/', async (req: Request<AircraftFilters>, res: Response<AircraftListResponse>) => {
  const data = AircraftFiltersSchema.parse(req.query)
  const activeOnly = isAircraftAdmin(req.user) ? (data.activeOnly ?? false) : true
  const visibleOnly = isAircraftAdmin(req.user) ? (data.visibleOnly ?? false) : true
  const aircrafts = await getAllAircraft(activeOnly, visibleOnly)

  res.status(200).json({
    aircrafts: await Promise.all(
      aircrafts.map(async aircraft => ({
        ...aircraft,
        status: await aircraftStatus(aircraft),
      })),
    ),
  })
})

// Get all aircraft registrations
router.get('/registrations', async (req: Request, res: Response<string[]>) => {
  const registrations = await getAircraftRegistrations()
  res.status(200).json(registrations)
})

// Get aircraft by registration
router.get(
  '/:registration',
  async (req: Request<{ registration: string }>, res: Response<Aircraft>) => {
    const aircraft = await getAircraftByRegistration(
      req.params.registration,
      !isAircraftAdmin(req.user),
      !isAircraftAdmin(req.user),
    )

    if (!aircraft) {
      return problem({ status: 404, detail: 'Aircraft not found' })
    }

    res.status(200).json({
      ...aircraft,
      status: await aircraftStatus(aircraft),
    })
  },
)

router.patch(
  '/:registration',
  validateUser(MIKPermissions.AIRCRAFT_ADMIN),
  async (req: Request<{ registration: string }>, res: Response<Aircraft>) => {
    const patch = AircraftSchema.partial().parse(req.body)
    const success = await updateAircraft(req.params.registration, patch, req.user!)
    if (!success) {
      return problem({ status: 404, detail: 'Aircraft not found' })
    }

    const aircraft = await getAircraftByRegistration(req.params.registration, false)
    res.status(200).json(aircraft)
  },
)

router.post(
  '/',
  validateUser(MIKPermissions.AIRCRAFT_ADMIN),
  async (req: Request, res: Response<Aircraft>) => {
    const aircraft = UpsertSchema(AircraftSchema).parse(req.body)
    const created = await addAircraft(aircraft, req.user!)

    res.status(200).json(created)
  },
)

router.delete(
  '/:registration',
  validateUser(MIKPermissions.AIRCRAFT_ADMIN),
  async (req: Request<{ registration: string }>, res: Response) => {
    const removed = await removeAircraft(req.params.registration)
    if (!removed) {
      return problem({ status: 404, detail: 'Aircraft document not found' })
    }

    res.status(204).end()
  },
)

const daysUntilExpiration = (expirationDate: string): number =>
  dayjs(expirationDate).endOf('day').diff(dayjs().endOf('day'), 'days')

const aircraftStatus = async (aircraft: Aircraft): Promise<AircraftStatus> => {
  const maintenance = aircraft.maintenance

  const totals = (await getFlightLogTotals(aircraft.registration))?.[0]
  const totalMins = totals?.acTotalFlightMins ?? 0

  const lastFlight: FlightLogListEntry | undefined = (
    await getFlightLogs({
      aircraftRegistration: aircraft.registration,
      orderLatestFirst: true,
      limit: 1,
      page: 1,
    })
  ).logs?.[0]

  const minsUntilNextMaintenance = Math.floor(maintenance.nextMaintenanceMins - totalMins)
  const usableMins =
    minsUntilNextMaintenance + (maintenance.totalPercentageHours - maintenance.reservedHours) * 60

  const daysUntilNextMaintenance = maintenance.nextMaintenanceDate
    ? Math.max(0, daysUntilExpiration(maintenance.nextMaintenanceDate))
    : undefined

  return {
    totalTime: totals?.acTotalFlightTime,

    lastLandingTimeUtc: lastFlight?.landingTimeUtc,
    lastLandingAirport: lastFlight?.arrivalAirport,

    remainingFuelLitres: lastFlight ? Math.round(lastFlight?.fuelRemainingLitres) : undefined,

    daysUntilNextMaintenance,
    minsUntilNextMaintenance,
    usableMins,

    warnings: [],
    cautions: [],
  }
}
