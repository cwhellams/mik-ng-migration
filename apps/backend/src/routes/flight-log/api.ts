import { Router, type Request, type Response } from 'express'

import {
  flightLogFiltersSchema,
  FlightLogInsertSchema,
  FlightLogUpdateSchema,
  type FlightLog,
} from './models.ts'
import {
  deleteFlightLog,
  getAllFlightLogs,
  insertFlightLog,
  updateFlightLog,
} from '../../db/flight-log-queries.ts'
import logger from '../../lib/logger.ts'
import { validateUser } from '../../middleware/authMiddleware.ts'
import type { JWTUser } from '../auth/token.ts'
import { MIKPermissions } from '../members/models.ts'

// all flight log routes are protected by flightlog permissions
const router = Router()
router.use(validateUser(MIKPermissions.FLIGHTLOG_USER, MIKPermissions.FLIGHTLOG_ADMIN))

const isFlightLogAdmin = (user?: JWTUser): boolean =>
  user?.permissions?.includes(MIKPermissions.FLIGHTLOG_ADMIN) ?? false

// Create a flight log
router.post('/', async (req: Request, res: Response) => {
  const payload = FlightLogInsertSchema.safeParse(req.body)

  if (!payload.success) {
    return res.status(400).json({ error: payload.error.errors })
  }

  //Override any supplied created by and updated by fields and use token
  payload.data.created_by = req.user!.memberId
  payload.data.updated_by = req.user!.memberId

  const flightId = await insertFlightLog(payload.data)

  res.status(201).json({ flight_id: flightId })
})

// Get logged in member's own flights
router.get('/my-flights', async (req: Request, res: Response) => {
  const parsedQuery = flightLogFiltersSchema.safeParse(req.query)
  if (!parsedQuery.success) {
    return res.status(400).json({ error: parsedQuery.error.errors })
  }

  // Combine the parsed query filters with the member ID filter
  const filters = {
    ...parsedQuery.data,
    billable_member_id: req.user!.memberId,
  }

  const logs = await getAllFlightLogs(filters)
  res.status(200).json(logs)
})

// Get flight logs using filter
router.get('/', async (req: Request, res: Response) => {
  const parsedQuery = flightLogFiltersSchema.safeParse(req.query)
  if (!parsedQuery.success) {
    return res.status(400).json({ error: parsedQuery.error.errors })
  }

  const logs = await getAllFlightLogs(parsedQuery.data)
  res.status(200).json(logs)
})

// Get a flight log by ID
router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params

  const flight_log = await getAllFlightLogs({ flight_id: Number(id) })
  if (flight_log.length === 0) {
    return res.status(404).json({ message: 'Flight log not found' })
  }
  res.status(200).json(flight_log[0])
})

const validateWriteAccess = (
  flights: FlightLog[],
  req: Request,
): { status: number; message: string } => {
  if (flights.length === 0) {
    return {
      status: 404,
      message: 'Flight log not found',
    }
  }

  // Check if the flight is owned by the user or the user is not an flightlog admin
  if (flights[0].billable_member_id !== req.user?.memberId && !isFlightLogAdmin(req.user)) {
    return {
      status: 403,
      message: 'Flight log not owned by user and user has no admin rights',
    }
  }

  if (flights[0].is_billed) {
    // Check if the flight is already billed
    return {
      status: 400,
      message: 'Flight already billed and read-only',
    }
  }

  return {
    status: 200,
    message: 'ok',
  }
}

// Update a flight log
router.patch('/:id', async (req: Request, res: Response) => {
  const flightId = Number(req.params.id)

  const validate = FlightLogUpdateSchema.safeParse(req.body)
  if (!validate.success) {
    return res.status(400).json({ error: validate.error.errors.map(e => e.message) })
  }

  const flightLogs = await getAllFlightLogs({ flight_id: flightId })

  const { status, message } = validateWriteAccess(flightLogs, req)
  if (status !== 200) {
    return res.status(status).json(message)
  }

  const updatedLog = await updateFlightLog(flightId, validate.data, req.user!)
  if (updatedLog === 0n) {
    return res.status(500).json({ message: 'Flight log update failed' })
  }

  res.status(204).end()
})

// Delete a flight log
router.delete('/:id', async (req: Request, res: Response) => {
  const flightId = Number(req.params.id)

  const flightLogToDelete = await getAllFlightLogs({ flight_id: flightId })
  const { status, message } = validateWriteAccess(flightLogToDelete, req)
  if (status !== 200) {
    return res.status(status).json(message)
  }

  logger.info(
    `Deleting flight log ${flightId}. Deleted by member: ${req.user?.memberId} with permissions :${req.user?.permissions}`,
  )

  const deletedLogRows = await deleteFlightLog(flightId)
  if (deletedLogRows === 0n) {
    return res.status(500).json({
      message: 'Flight log deletion failed',
    })
  }

  res.status(204).end()
})

export default router
