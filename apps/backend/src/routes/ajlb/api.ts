import { Router, type Request, type Response } from 'express'

import { AircraftJourneyLogBookFilterSchema } from './model.ts'
import { getAjlbs } from '../../db/ajlb-queries.ts'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '../members/models.ts'

export const router = Router()

router.use(validateUser(MIKPermissions.FLIGHTLOG_USER, MIKPermissions.FLIGHTLOG_ADMIN))

router.get('/', async (req: Request, res: Response) => {
  const filters = AircraftJourneyLogBookFilterSchema.parse(req.query)

  const books = await getAjlbs(filters)
  res.status(200).json({ books })
})

export default router
