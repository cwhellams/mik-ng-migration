import { Router, type Request, type Response } from 'express'

import { deleteFlightLog, getAllFlightLogs, insertFlightLog } from '../../db/queries.ts'
import logger from '../../lib/logger.ts'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { flightLogFiltersSchema, FlightLogInsertSchema, MIKRoles } from '../members/models.ts'

const router = Router()

// Create a flight log
router.post('/', validateUser(), async (req: Request, res: Response) => {
  try {
    const payload = FlightLogInsertSchema.safeParse(req.body)

    if (!payload.success) {
      return res.status(400).json({ error: payload.error.errors })
    }

    //Override any supplied created by and updated by fields and use token
    payload.data.created_by = req.user!.memberId.toString()
    payload.data.updated_by = req.user!.memberId.toString()

    const flightId = await insertFlightLog(payload.data)

    res.status(201).json({ flight_id: flightId })
  } catch (err) {
    logger.error(err)
    res.status(500).json({ message: 'Failed to create flight log' })
  }
})

// Get flight logs uisng filter
router.get('/', validateUser(), async (req: Request, res: Response) => {
  try {
    // Validate the query params
    const parsedQuery = flightLogFiltersSchema.safeParse(req.query)
    if (!parsedQuery.success) {
      return res.status(400).json({ error: parsedQuery.error.errors })
    }

    const logs = await getAllFlightLogs(parsedQuery.data)
    res.status(200).json(logs)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to fetch flight logs' })
  }
})

// Get a flight log by ID
router.get('/:id', validateUser(), async (req: Request, res: Response) => {
  const { id } = req.params
  try {
    const flight_log = await getAllFlightLogs({ flight_id: Number(id) })
    if (flight_log.length === 0) {
      return res.status(404).json({ message: 'Flight log not found' })
    }
    res.status(200).json(flight_log[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to fetch flight log' })
  }
})

// // Update a flight log
// router.put('/:id', async (req: Request, res: Response) => {
//   const { id } = req.params
//   try {
//     const updatedLog = await db
//       .updateTable('logs')
//       .set(req.body)
//       .where('flight_id', '=', id)
//       .returning('*')
//       .execute()
//     if (updatedLog.length === 0) {
//       return res.status(404).json({ message: 'Flight log not found' })
//     }
//     res.status(200).json(updatedLog[0])
//   } catch (err) {
//     console.error(err)
//     res.status(500).json({ message: 'Failed to update flight log' })
//   }
// })

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
    flightLogToDelete[0].billable_member_id !== req.user!.memberId ||
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

  const deletedLogRows = await deleteFlightLog(Number(id), req.user!.memberId)
  if (deletedLogRows === 0n) {
    return res.status(404).json({
      message: 'Flight log not found, flight not owned by user or flight already billed',
    })
  }
  res.status(204).end()
})

export default router
