import dayjs from 'dayjs'
import { Router, type Request, type Response } from 'express'

import {
  AircraftDocumentSchema,
  AircraftSchema,
  type Aircraft,
  type AircraftAlert,
  type AircraftDocument,
  type AircraftListResponse,
  type AircraftStatus,
} from './models.ts'
import {
  getAllAircraft,
  getAircraftByRegistration,
  updateAircraft,
  addAircraft,
  getDocuments,
  updateAircraftDocument,
  addAircraftDocument,
  removeAircraftDocument,
} from '../../db/aircraft-queries.ts'
import { getFlightLogs, getFlightLogTotals } from '../../db/flight-log-queries.ts'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { UpsertSchema } from '../../types/schema.ts'
import type { JWTUser } from '../auth/token.ts'
import { MIKPermissions } from '../members/models.ts'
import { problem } from '../response.ts'
import type { FlightLog } from '../flight-log/models.ts'

// all aircarft routes are protected by aircraft permissions
export const router = Router()
router.use(validateUser(MIKPermissions.AIRCRAFT_USER, MIKPermissions.AIRCRAFT_ADMIN))

const isAircraftAdmin = (user?: JWTUser): boolean =>
  user?.permissions?.includes(MIKPermissions.AIRCRAFT_ADMIN) ?? false

// Get all aircraft
router.get('/', async (req: Request, res: Response<AircraftListResponse>) => {
  const aircrafts = await getAllAircraft(!isAircraftAdmin(req.user))

  res.status(200).json({
    aircrafts: await Promise.all(
      aircrafts.map(async aircraft => ({
        ...aircraft,
        status: await aircraftStatus(aircraft),
      })),
    ),
  })
})

// Get aircraft by registration
router.get(
  '/:registration',
  async (req: Request<{ registration: string }>, res: Response<Aircraft>) => {
    const aircraft = await getAircraftByRegistration(
      req.params.registration,
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

router.patch(
  '/:registration/documents/:documentId',
  validateUser(MIKPermissions.AIRCRAFT_ADMIN),
  async (
    req: Request<{ registration: string; documentId: string }>,
    res: Response<AircraftDocument>,
  ) => {
    const patch = AircraftDocumentSchema.partial().parse(req.body)
    const success = await updateAircraftDocument(
      req.params.registration,
      req.params.documentId,
      patch,
      req.user!,
    )
    if (!success) {
      return problem({ status: 404, detail: 'Aircraft document not found' })
    }

    const document = await getDocuments(req.params.registration, req.params.documentId)
    res.status(200).json(document?.[0])
  },
)

router.post(
  '/:registration/documents',
  validateUser(MIKPermissions.AIRCRAFT_ADMIN),
  async (req: Request<{ registration: string }>, res: Response<AircraftDocument>) => {
    const document = UpsertSchema(AircraftDocumentSchema).parse(req.body)
    const created = await addAircraftDocument(req.params.registration, document, req.user!)

    res.status(200).json(created)
  },
)

router.delete(
  ':registration/documents/:documentId',
  validateUser(MIKPermissions.AIRCRAFT_ADMIN),
  async (req: Request<{ registration: string; documentId: string }>, res: Response) => {
    const removed = await removeAircraftDocument(req.params.registration, req.params.documentId)
    if (!removed) {
      return problem({ status: 404, detail: 'Aircraft document not found' })
    }

    res.status(204).end()
  },
)

const daysUntilExpiration = (expirationDate: string): number =>
  dayjs(expirationDate).endOf('day').diff(dayjs().endOf('day'), 'days')

const expiredDocuments = (aircraft: Aircraft) => {
  const alerts: AircraftAlert[] = aircraft.documents
    .map(doc => {
      if (doc.endDate) {
        return {
          documentId: doc.documentId,
          description: '',
          untilExpiration: daysUntilExpiration(doc.endDate),
          hardLimit: doc.hardLimit,
          softLimit: doc.softLimit,
        }
      } else {
        return undefined
      }
    })
    .filter(d => d !== undefined)

  const warnings = alerts.filter(doc => {
    return doc.hardLimit !== null && doc.untilExpiration !== null
      ? doc.untilExpiration < doc.hardLimit
      : false
  })

  const cautions = alerts.filter(doc => {
    if (warnings.some(w => w.documentId == doc.documentId)) {
      // there is already a warning, no need for a caution message
      return false
    }

    return doc.softLimit !== null && doc.untilExpiration !== null
      ? doc.untilExpiration <= doc.softLimit
      : false
  })

  return {
    warnings,
    cautions,
  }
}

const aircraftStatus = async (aircraft: Aircraft): Promise<AircraftStatus> => {
  const maintenance = aircraft.maintenance

  const totalTime = (await getFlightLogTotals(aircraft.registration))?.[0]?.acTotalFlightHours ?? 0

  const lastFlight: FlightLog | undefined = (
    await getFlightLogs({
      aircraftRegistration: aircraft.registration,
      last: true,
    })
  )?.[0]

  const tachUntilNextMaintenance = maintenance.nextMaintenanceTach - totalTime
  const usablePercentageHours = tachUntilNextMaintenance + maintenance.usablePercentageHours
  const totalPercentageHours = tachUntilNextMaintenance + maintenance.totalPercentageHours

  const daysUntilNextMaintenance = maintenance.nextMaintenanceDate
    ? Math.max(0, daysUntilExpiration(maintenance.nextMaintenanceDate))
    : undefined

  const documents = expiredDocuments(aircraft)

  const warnings: AircraftAlert[] = [
    // add warning if no more usable hours left
    tachUntilNextMaintenance <= 0 && usablePercentageHours <= 0
      ? {
          description: 'aircraft.alerts.noUsableHours',
          untilExpiration: totalPercentageHours,
          hardLimit: maintenance.totalPercentageHours,
          softLimit: maintenance.usablePercentageHours,
        }
      : undefined,

    // expired documents
    ...documents.warnings.map(doc => ({
      ...doc,
      untilExpiration: Math.abs(doc.untilExpiration),
      description: 'aircraft.alerts.expired',
    })),
  ].filter(w => w !== undefined)

  const cautions: AircraftAlert[] = [
    // add caution if only percentage hours left
    tachUntilNextMaintenance <= 0 && usablePercentageHours > 0
      ? {
          description: 'aircraft.alerts.usableHours',
          untilExpiration: usablePercentageHours,
          hardLimit: maintenance.totalPercentageHours,
          softLimit: maintenance.usablePercentageHours,
        }
      : undefined,

    // documents expiring soon
    ...documents.cautions.map(doc => ({
      ...doc,
      description: 'aircraft.alerts.expiring',
    })),
  ].filter(w => w !== undefined)

  return {
    totalTime,
    lastLandingTimeUtc: lastFlight?.landingTimeUtc?.toISOString() ?? undefined,
    lastLandingAirport: lastFlight?.arrivalAirport,

    remainingFuelLitres: Math.round(lastFlight?.fuelRemainingLitres),

    daysUntilNextMaintenance,
    tachUntilNextMaintenance,
    usablePercentageHours,
    totalPercentageHours,

    warnings,
    cautions,
  }
}
