import { Router, type Request, type Response } from 'express'

import {
  FlightLogAdminUpsertSchema,
  FlightLogFiltersSchema,
  FlightLogMemberUpsertSchema,
  type FlightLog,
  type FlightLogFilters,
  type FlightLogListResponse,
} from './models.ts'
import {
  deleteFlightLog,
  getFlightLogs,
  getFlightLogTotals,
  insertFlightLog,
  updateFlightLog,
} from '../../db/flight-log-queries.ts'
import logger from '../../lib/logger.ts'
import { validateUser } from '../../middleware/authMiddleware.ts'
import type { JWTUser } from '../auth/token.ts'
import { MIKPermissions } from '../members/models.ts'
import { problem } from '../response.ts'

// all flight log routes are protected by flightlog permissions
const router = Router()
router.use(validateUser(MIKPermissions.FLIGHTLOG_USER, MIKPermissions.FLIGHTLOG_ADMIN))

const isFlightLogAdmin = (user?: JWTUser): boolean =>
  user?.permissions?.includes(MIKPermissions.FLIGHTLOG_ADMIN) ?? false

// Create a flight log
router.post('/', async (req: Request, res: Response) => {
  const data = FlightLogMemberUpsertSchema.parse(req.body)

  const flightId = await insertFlightLog(data, req.user!)
  res.status(201).json({ flight_id: flightId })
})

// Get flight logs using filter
router.get('/', async (req: Request<FlightLogFilters>, res: Response<FlightLogListResponse>) => {
  const data = FlightLogFiltersSchema.parse(req.query)

  // If user is not Flight Log Admin they can only see their own flights
  const filters: FlightLogFilters = {
    ...data,
    ...(isFlightLogAdmin(req.user) ? {} : { billable_member_id: req.user!.memberId }),
  }

  const logs = await getFlightLogs(filters)
  res.status(200).json({ logs })
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

  const flights = await getFlightLogs({ flightId: id })
  if (flights.length === 0) {
    return problem({ status: 404, detail: 'Flight log not found' })
  }
  res.status(200).json(flights[0])
})

const validateWriteAccess = (flights: FlightLog[], req: Request) => {
  if (flights.length === 0) {
    return problem({ status: 404, detail: 'Flight log not found' })
  }

  // Check if the flight is owned by the user or the user is not an flightlog admin
  if (flights[0].billableMemberId !== req.user?.memberId && !isFlightLogAdmin(req.user)) {
    return problem({
      status: 403,
      detail: 'Flight log not owned by user or user has no admin rights',
    })
  }

  if (flights[0].isBilled) {
    // Check if the flight is already billed
    return problem({
      status: 400,
      detail: 'Flight already billed and read-only',
    })
  }
}

// Update a flight log
router.patch('/:id', async (req: Request, res: Response) => {
  const flightId = req.params.id

  const schema = isFlightLogAdmin(req.user)
    ? FlightLogAdminUpsertSchema
    : FlightLogMemberUpsertSchema

  const data = schema.partial().parse(req.body)

  const flightLogs = await getFlightLogs({ flightId: flightId })

  validateWriteAccess(flightLogs, req)

  const updatedLog = await updateFlightLog(flightId, data, req.user!)
  if (updatedLog === 0n) {
    return problem({
      status: 500,
      detail: 'Flight log update failed',
    })
  }

  res.status(204).end()
})

// Delete a flight log
router.delete('/:id', async (req: Request, res: Response) => {
  const flightId = req.params.id

  const flightLogToDelete = await getFlightLogs({ flightId: flightId })
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
