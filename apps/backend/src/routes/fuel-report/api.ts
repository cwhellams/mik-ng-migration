import { Router, type Request, type Response } from 'express'
import { HttpStatusCode } from 'axios'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '@mik/contracts/members'
import { getRecentFuelings } from '../../db/fuel-report-queries.ts'
import { FuelReportFiltersSchema, type FuelReportResponse } from '@mik/contracts/fuel-report'
import { problem } from '../response.ts'
import logger from '../../lib/logger.ts'

const router = Router()

// Same audience as the (manually maintained) fuel prices page.
router.use(validateUser(MIKPermissions.FUEL_PRICES_USER, MIKPermissions.FUEL_PRICES_ADMIN))

router.get('/', async (req: Request, res: Response<FuelReportResponse>) => {
  const parsed = FuelReportFiltersSchema.safeParse(req.query)
  if (!parsed.success) {
    return problem({
      status: HttpStatusCode.BadRequest,
      detail: 'Invalid query parameters.',
    })
  }

  try {
    const data = await getRecentFuelings(parsed.data)
    res.json({ data })
  } catch (error) {
    logger.error('Error fetching fuel report:', error)
    return problem({
      status: HttpStatusCode.InternalServerError,
      detail: 'Failed to fetch fuel report data.',
    })
  }
})

export default router
