import { Router, type Request, type Response } from 'express'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '@mik/contracts/members'
import { getUpliftReport } from '../../db/uplift-report-queries.ts'
import {
  UpliftReportFiltersSchema,
  type UpliftReportFilters,
  type UpliftReportResponse,
} from '@mik/contracts/uplift-reports'
import { problem } from '../response.ts'
import { validate } from '../validate.ts'
import { HttpStatusCode } from 'axios'
import logger from '../../lib/logger.ts'

const router = Router()

// Only INVOICING_ADMIN can access uplift reports
router.use(validateUser(MIKPermissions.INVOICING_ADMIN))

router.get(
  '/',
  validate(UpliftReportFiltersSchema, 'query'),
  async (req: Request, res: Response<UpliftReportResponse>) => {
    const filters = req.validated?.query as UpliftReportFilters

    logger.info(`Fetching uplift report with filters: ${JSON.stringify(filters)}`)

    try {
      const result = await getUpliftReport(filters)
      res.json({ ...result, filters })
    } catch (error) {
      logger.error('Error fetching uplift report:', error)
      return problem({
        status: HttpStatusCode.InternalServerError,
        detail: 'Failed to fetch uplift report data.',
      })
    }
  },
)

export default router
