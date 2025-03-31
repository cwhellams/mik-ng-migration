import { Router, type Request, type Response } from 'express'

import {
  deleteFlightLog,
  getAllFlightLogs,
  insertFlightLog,
  updateFlightLog,
} from '../../db/flight-log-queries.ts'
import { validateUser } from '../../middleware/authMiddleware.ts'
import {
  flightLogFiltersSchema,
  FlightLogInsertSchema,
  FlightLogUpdateSchema,
  type FlightLogUpdateRequest,
} from './models.ts'

import { MIKRoles } from '../members/models.ts'

const router = Router()

// Create a flight log
router.post('/', validateUser(), async (req: Request, res: Response) => {
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
router.get('/my-flights', validateUser(), async (req: Request, res: Response) => {
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

// Get flight logs uisng filter
router.get('/', validateUser(), async (req: Request, res: Response) => {
  const parsedQuery = flightLogFiltersSchema.safeParse(req.query)
  if (!parsedQuery.success) {
    return res.status(400).json({ error: parsedQuery.error.errors })
  }

  const logs = await getAllFlightLogs(parsedQuery.data)
  res.status(200).json(logs)
})

// Get a flight log by ID
router.get('/:id', validateUser(), async (req: Request, res: Response) => {
  const { id } = req.params

  const flight_log = await getAllFlightLogs({ flight_id: Number(id) })
  if (flight_log.length === 0) {
    return res.status(404).json({ message: 'Flight log not found' })
  }
  res.status(200).json(flight_log[0])
})

// Update a flight log
router.patch('/:id', validateUser(), async (req: Request, res: Response) => {
  const flight_id = Number(req.params.id)

  const validate = FlightLogUpdateSchema.safeParse(req.body)

  if (!validate.success) {
    return res.status(400).json({ error: validate.error.errors.map(e => e.message) })
  }

  const updatePayload: FlightLogUpdateRequest = validate.data
  const updatedLog = await updateFlightLog(flight_id, updatePayload, req.user!)
  if (updatedLog === 0n) {
    return res
      .status(404)
      .json({ message: 'Flight log not found or flight not billable to member' })
  }

  res.status(204).end()
})

// Delete a flight log
router.delete('/:id', validateUser(), async (req: Request, res: Response) => {
  const { id } = req.params

  const flightLogToDelete = await getAllFlightLogs({ flight_id: Number(id) })
  if (flightLogToDelete.length === 0) {
    return res.status(404).json({
      message: 'Flight log not found',
    })
  }

  // Check if the flight is owned by the user or the user is not an admin or committee member
  if (
    flightLogToDelete[0].billable_member_id !== req.user!.memberId &&
    !req.user!.roles.some(role => [MIKRoles.ADMIN, MIKRoles.COMMITTEE].includes(role))
  ) {
    // Check if the flight is owned by the user
    return res.status(403).json({
      message: 'Flight log not owned by user and user has no admin rights',
    })
  }

  if (flightLogToDelete[0].is_billed) {
    // Check if the flight is already billed
    return res.status(400).json({
      message: 'Flight already billed, unable to delete',
    })
  }

  const deletedLogRows = await deleteFlightLog(Number(id), req.user!)
  if (deletedLogRows === 0n) {
    return res.status(404).json({
      message: 'Flight log not found, flight not owned by user or flight already billed',
    })
  }
  res.status(204).end()
})

export default router
