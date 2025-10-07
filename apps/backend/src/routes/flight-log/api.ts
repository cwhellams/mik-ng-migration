import { Router, type Request, type Response } from 'express'

import {
  FlightLogUpsertSchema,
  flightLogDateValidator,
  FlightLogFiltersSchema,
  FlightLogMemberUpsertSchema,
  type FlightLog,
  type FlightLogFilters,
  type FlightLogListResponse,
  FlightLogStatus,
  FlightLogValidationRequestSchema,
  validateFlightLogTimes,
} from './models.ts'
import {
  deleteFlightLog,
  getFlightLog,
  getFlightLogs,
  getFlightLogTotals,
  insertFlightLog,
  updateFlightLog,
  updateFlightLogStatus,
} from '../../db/flight-log-queries.ts'
import logger from '../../lib/logger.ts'
import { validateUser } from '../../middleware/authMiddleware.ts'
import type { JWTUser } from '../auth/token.ts'
import { MIKPermissions } from '../members/models.ts'
import { problem } from '../response.ts'
import { getAirfields } from '../../db/airfields-queries.ts'
import { getAjlbs } from '../../db/ajlb-queries.ts'
import type { z } from 'zod'

// all flight log routes are protected by flightlog permissions
const router = Router()
router.use(validateUser(MIKPermissions.FLIGHTLOG_USER, MIKPermissions.FLIGHTLOG_ADMIN))

const isFlightLogAdmin = (user?: JWTUser): boolean =>
  user?.permissions?.includes(MIKPermissions.FLIGHTLOG_ADMIN) ?? false

// Get flight log total times by registraion
router.get('/airfields', async (req: Request, res: Response) => {
  const reg = req.params.registration
  const airfields = await getAirfields(reg)
  if (airfields.length === 0) {
    return problem({ status: 404, detail: 'Airfields not found' })
  }
  res.status(200).json({ airfields })
})

// Create a flight log
router.post('/', async (req: Request, res: Response) => {
  const isAdmin = isFlightLogAdmin(req.user)
  if (isAdmin) {
    // admin can create flight logs for other members
    const data = flightLogDateValidator(FlightLogUpsertSchema).parse(req.body)
    const billableMemberId = data.billableMemberId ?? req.user!.memberId

    const flightId = await insertFlightLog(data, billableMemberId, req.user!)
    res.status(201).json({ flight_id: flightId })
  } else {
    // drop any admin fields the UI might send in the request
    const data = flightLogDateValidator(FlightLogMemberUpsertSchema.strip()).parse(req.body)
    const flightId = await insertFlightLog(data, req.user!.memberId, req.user!)
    res.status(201).json({ flight_id: flightId })
  }
})

// Get flight logs using filter
router.get('/', async (req: Request<FlightLogFilters>, res: Response<FlightLogListResponse>) => {
  const data = FlightLogFiltersSchema.parse(req.query)

  // FlightLog admin can see logs of all members, normal users only through logbooks
  const filters: FlightLogFilters = {
    ...data,
    ...(!isFlightLogAdmin(req.user) && data.ajlbSeqNo == undefined
      ? { billableMemberId: req.user!.memberId }
      : {}),
  }

  const logs = await getFlightLogs(filters)
  res.status(200).json(logs)
})

// Get flight log total times by registration
router.get('/totals', async (req: Request, res: Response) => {
  const totals = await getFlightLogTotals()

  if (totals.length === 0) {
    return problem({ status: 404, detail: 'Flight totals not found' })
  }
  res.status(200).json(totals)
})

// Get flight log total times by registraion
router.get('/:registration/totals', async (req: Request, res: Response) => {
  const reg = req.params.registration
  const totals = await getFlightLogTotals(reg)
  if (totals.length === 0) {
    return problem({ status: 404, detail: 'Flight totals not found' })
  }
  res.status(200).json(totals)
})

// Get a flight log by ID
// Caution - KEEP THIS LASTin Get endpoints so that other paths are used first
router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params

  const flight = await getFlightLog(id)
  if (!flight) {
    return problem({ status: 404, detail: 'Flight log not found' })
  }

  validateReadAccess(flight, req)

  res.status(200).json(flight)
})

const validateReadAccess = (flight: Pick<FlightLog, 'billableMemberId'>, req: Request) => {
  // Check if the flight is owned by the user or the user is not an flightlog admin
  if (flight.billableMemberId !== req.user?.memberId && !isFlightLogAdmin(req.user)) {
    return problem({
      status: 403,
      detail: 'Flight log not owned by user or user has no admin rights',
    })
  }
}

const validateWriteAccess = (
  flight: Pick<FlightLog, 'billableMemberId' | 'isBilled'> | undefined,
  req: Request,
) => {
  if (!flight) {
    return problem({ status: 404, detail: 'Flight log not found' })
  }

  validateReadAccess(flight, req)

  if (flight.isBilled) {
    // Check if the flight is already billed
    return problem({
      status: 400,
      detail: 'Flight already billed and read-only',
    })
  }
}

const getAjlb = async (registration: string) => {
  const ajlbs = await getAjlbs({ current: true, aircraftRegistration: registration })
  return ajlbs?.[0]?.seqNo
}

// Update a flight log
router.patch('/:id', async (req: Request, res: Response) => {
  const flightId = req.params.id

  const schema = isFlightLogAdmin(req.user)
    ? // admin can edit all editable fields
      FlightLogUpsertSchema
    : // strip any admin fields the UI might send in the request
      FlightLogMemberUpsertSchema.strip()

  const patch = schema.partial().parse(req.body)

  const flightLog = await getFlightLog(flightId)
  validateWriteAccess(flightLog, req)

  // validate all times are still valid together
  const errors: z.IssueData[] = []
  validateFlightLogTimes(
    {
      offBlockTimeEpoch: patch?.offBlockTimeEpoch ?? flightLog!.offBlockTimeEpoch,
      takeoffTimeEpoch: patch?.takeoffTimeEpoch ?? flightLog!.takeoffTimeEpoch,
      landingTimeEpoch: patch?.landingTimeEpoch ?? flightLog!.landingTimeEpoch,
      onBlockTimeEpoch: patch?.onBlockTimeEpoch ?? flightLog!.onBlockTimeEpoch,
    },
    issue => errors.push(issue),
  )
  if (errors.length > 0) {
    return problem({ status: 400, extensions: { errors } })
  }

  // if plane changes the ajlbSeqNo must be updated too
  const ajlbSeqNo =
    patch.aircraftRegistration && flightLog?.aircraftRegistration !== patch.aircraftRegistration
      ? await getAjlb(patch.aircraftRegistration)
      : flightLog?.ajlbSeqNo

  const updatedLog = await updateFlightLog(
    flightId,
    {
      ...patch,
      ajlbSeqNo,
    },
    req.user!,
  )
  if (updatedLog === 0n) {
    return problem({
      status: 500,
      detail: 'Flight log update failed',
    })
  }

  const afterUpdate = await getFlightLog(flightId)

  res.status(200).json(afterUpdate)
})

// Admin only route: update a flight log status
router.post(
  '/:id/validate',
  validateUser(MIKPermissions.FLIGHTLOG_ADMIN),
  async (req: Request, res: Response) => {
    const flightId = req.params.id

    const { revert } = FlightLogValidationRequestSchema.parse(req.body ?? {})

    const flightLog = await getFlightLog(flightId)

    validateWriteAccess(flightLog, req)

    // all previous flights must be validated

    if (revert) {
      const lastValidatedFlight = await getFlightLogs({
        aircraftRegistration: flightLog?.aircraftRegistration,
        status: FlightLogStatus.VALIDATED,
        limit: 1,
        page: 1,
        orderLatestFirst: true,
      })
      if (lastValidatedFlight.rows == 0 || lastValidatedFlight.logs[0].flightId !== flightId) {
        return problem({
          status: 400,
          detail: `All later flights must be first reverted, revert ${lastValidatedFlight.logs?.[0]?.flightId} first`,
        })
      }
    } else {
      const firstNewFlight = await getFlightLogs({
        aircraftRegistration: flightLog?.aircraftRegistration,
        status: FlightLogStatus.NEW,
        limit: 1,
        page: 1,
      })
      if (firstNewFlight.rows == 0 || firstNewFlight.logs[0].flightId !== flightId) {
        return problem({
          status: 400,
          detail: `All previous flights must be first validated, validate ${firstNewFlight.logs?.[0]?.flightId} first`,
        })
      }
    }

    const updatedLog = await updateFlightLogStatus(
      flightId,
      revert ? FlightLogStatus.NEW : FlightLogStatus.VALIDATED,
      {},
      req.user!,
    )
    if (updatedLog === 0n) {
      return problem({
        status: 500,
        detail: 'Flight log update failed',
      })
    }

    const afterUpdate = await getFlightLog(flightId)

    res.status(200).json(afterUpdate)
  },
)

// Delete a flight log
router.delete('/:id', async (req: Request, res: Response) => {
  const flightId = req.params.id

  const flightLogToDelete = await getFlightLog(flightId)
  validateWriteAccess(flightLogToDelete, req)

  logger.info(
    `Deleting flight log ${flightId}. Deleted by member: ${req.user?.memberId} with permissions :${req.user?.permissions}`,
  )

  const deletedLogRows = await deleteFlightLog(flightId)
  if (deletedLogRows === 0n) {
    return problem({
      status: 500,
      detail: 'Flight log deletion failed',
    })
  }

  res.status(204).end()
})

export default router
