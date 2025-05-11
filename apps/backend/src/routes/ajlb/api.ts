import { Router, type Request, type Response } from 'express'

import { AircraftJourneyLogBookFilter } from './model.ts'
import { getCurrentAjlbs, getFilteredAjlbs } from '../../db/ajlb-queries.ts'
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
  const filters = AircraftJourneyLogBookFilter.parse(req.query)

  const logs = await getFilteredAjlbs(filters)
  res.status(200).json(logs)
})

router.get('/latest', async (_req: Request, res: Response) => {
  const data = await getCurrentAjlbs()
  res.status(200).json(data)
})

export default router
