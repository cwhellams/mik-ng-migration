import { Router, type Request, type Response } from 'express'

import { flightAircraftJourneyLogBookFilter, type AjlbFilter } from './model.ts'
import { getAllAjlbs, getCurrentAjlbs, getFilteredAjlbs } from '../../db/ajlb-queries.ts'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '../members/models.ts'

export const router = Router()

router.use(
  validateUser(
    MIKPermissions.BOOKING_ADMIN,
    MIKPermissions.FLIGHTLOG_ADMIN,
    MIKPermissions.AIRCRAFT_ADMIN,
  ),
)

router.get('/', async (req: Request, res: Response) => {
  const parsedQuery = flightAircraftJourneyLogBookFilter.safeParse(req.query)
  if (!parsedQuery.success) {
    return res.status(400).json({ error: parsedQuery.error.errors })
  }

  // If user is not Flight Log Admin they can only see their own flights
  const filters: AjlbFilter = parsedQuery.data

  const logs = await getFilteredAjlbs(filters)
  res.status(200).json(logs)
})

router.get('/latest', async (_req: Request, res: Response) => {
  const data = await getCurrentAjlbs()
  res.status(200).json(data)
})

export default router
