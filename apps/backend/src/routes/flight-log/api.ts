import { Router, type Request, type Response } from 'express'
import type { ZodIssue } from 'zod'

import {
  flightLogFiltersSchema,
  flightLogInsertSchema,
  flightLogUpdateSchema,
  type FlightLog,
  type FlightLogFilters,
  type FlightLogInsertRequest,
} from './models.ts'
import {
  deleteFlightLog,
  getFlightLogs,
  getFlightLogTotals,
  insertFlightLog,
  updateFlightLog,
} from '../../db/flight-log-queries.ts'
import { getMemberById } from '../../db/member-queries.ts'
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
  const payload = flightLogInsertSchema.safeParse(req.body)

  if (!payload.success) {
    return res.status(400).json({ error: payload.error.errors })
  }

  const insPayload: FlightLogInsertRequest = payload.data

  // Check if user is a DTO training pilot and set the flag accordingly, this is used for billing
  // and should not be set by the user
  const member = await getMemberById(req.user!.memberId)
  insPayload.is_dto_training_flight = member?.isTrainingProgramPilot ?? false

  const flightId = await insertFlightLog(insPayload, req.user!)
  res.status(201).json({ flight_id: flightId })
})

// Get flight logs using filter
router.get('/', async (req: Request, res: Response) => {
  const parsedQuery = flightLogFiltersSchema.safeParse(req.query)
  if (!parsedQuery.success) {
    return res.status(400).json({ error: parsedQuery.error.errors })
  }

  // If user is not Flight Log Admin they can only see their own flights
  const filters: FlightLogFilters = {
    ...parsedQuery.data,
    ...(isFlightLogAdmin(req.user) ? {} : { billable_member_id: req.user!.memberId }),
  }

  const logs = await getFlightLogs(filters)
  res.status(200).json(logs)
})

// Get flight log total times by registraion
router.get('/totals', async (req: Request, res: Response) => {
  const flight_time_totals = await getFlightLogTotals()

  if (flight_time_totals.length === 0) {
    return res.status(404).json({ message: 'Flight Times not found' })
  }
  res.status(200).json(flight_time_totals)
})

// Get flight log total times by registraion
router.get('/:registration/totals', async (req: Request, res: Response) => {
  const reg = req.params.registration
  const flight_time_totals = await getFlightLogTotals(reg)
  if (flight_time_totals.length === 0) {
    return res.status(404).json({ message: 'Flight Times not found' })
  }
  res.status(200).json(flight_time_totals)
})

// Get a flight log by ID
// Caution - KEEP THIS LASTin Get endpoints so that other paths are used first
router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params

  const flight_log = await getFlightLogs({ flight_id: id })
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
      message: 'Flight log not owned by user or user has no admin rights',
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
  const flightId = req.params.id

  const validate = flightLogUpdateSchema.safeParse(req.body)

  if (!validate.success) {
    return res.status(400).json({ error: validate.error.errors.map((e: ZodIssue) => e.message) })
  }

  const flightLogs = await getFlightLogs({ flight_id: flightId })

  const { status, message } = validateWriteAccess(flightLogs, req)
  if (status !== 200) {
    return res.status(status).json({ message })
  }

  // Check if user is a DTO training pilot and set the flag accordingly, this is used for billing
  // and should not be set by the user
  const member = await getMemberById(req.user!.memberId)
  validate.data.is_dto_training_flight = member?.isTrainingProgramPilot ?? false

  const updatedLog = await updateFlightLog(flightId, validate.data, req.user!)
  if (updatedLog === 0n) {
    return res.status(500).json({ message: 'Flight log update failed' })
  }

  res.status(204).end()
})

// Delete a flight log
router.delete('/:id', async (req: Request, res: Response) => {
  const flightId = req.params.id

  const flightLogToDelete = await getFlightLogs({ flight_id: flightId })
  const { status, message } = validateWriteAccess(flightLogToDelete, req)
  if (status !== 200) {
    return res.status(status).json({ message })
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
