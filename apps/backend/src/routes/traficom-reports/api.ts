import { Router, type Request, type Response } from 'express'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '../members/models.ts'
import { getTraficomReport } from '../../db/traficom-report-queries.ts'
import {
  TraficomReportFiltersSchema,
  type TraficomReportFilters,
  type TraficomReportResponse,
} from './models.ts'
import { problem } from '../response.ts'
import { validate } from '../validate.ts'
import { HttpStatusCode } from 'axios'
import logger from '../../lib/logger.ts'

const router = Router()

// Only INVOICING_ADMIN can access traficom reports
router.use(validateUser(MIKPermissions.INVOICING_ADMIN))

router.get(
  '/',
  validate(TraficomReportFiltersSchema, 'query'),
  async (req: Request, res: Response<TraficomReportResponse>) => {
    const filters = req.validated?.query as TraficomReportFilters

    logger.info(`Fetching traficom report with filters: ${JSON.stringify(filters)}`)

    try {
      const data = await getTraficomReport(filters)
      res.json({
        data,
        filters,
      })
    } catch (error) {
      logger.error('Error fetching traficom report:', error)
      return problem({
        status: HttpStatusCode.InternalServerError,
        detail: 'Failed to fetch traficom report data.',
      })
    }
  },
)

export default router
