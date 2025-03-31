import { Router, type Request, type Response } from 'express'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { getAllAircraft, getAircraftByRegistration } from '../../db/queries.ts'
import { z } from 'zod'
import { baseAircraftSchema } from './models.ts'

export const router = Router()

// Get all aircraft
router.get('/', validateUser(), async (_req: Request, res: Response) => {
  try {
    const aircraftData = await getAllAircraft()
    // Validate response data against schema
    const validatedAircraft = z.array(baseAircraftSchema).parse(aircraftData)
    res.status(200).json(validatedAircraft)
  } catch (error) {
    console.error('Error fetching aircraft:', error)
    res.status(500).json({ message: 'Failed to retrieve aircraft' })
  }
})

// Get aircraft by registration
router.get('/:registration', validateUser(), async (req: Request, res: Response) => {
  try {
    const { registration } = req.params
    const aircraftData = await getAircraftByRegistration(registration)

    if (!aircraftData) {
      return res.status(404).json({ message: 'Aircraft not found' })
    }

    // Validate response data against schema
    const validatedAircraft = baseAircraftSchema.parse(aircraftData)
    res.status(200).json(validatedAircraft)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(500).json({ message: 'Data validation error', errors: error.errors })
    }
    console.error('Error fetching aircraft:', error)
    res.status(500).json({ message: 'Failed to retrieve aircraft' })
  }
})

export default router
