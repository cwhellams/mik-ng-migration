import { Router, type Request, type Response } from 'express'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '../members/models.ts'
import { getTaxReport } from '../../db/tax-report-queries.ts'
import { TaxReportFiltersSchema, type TaxReportFilters, type TaxReportResponse } from './models.ts'
import { problem } from '../response.ts'
import { validate } from '../validate.ts'
import { HttpStatusCode } from 'axios'
import logger from '../../lib/logger.ts'

const router = Router()

// Only INVOICING_ADMIN can access tax reports
router.use(validateUser(MIKPermissions.INVOICING_ADMIN))

router.get(
  '/',
  validate(TaxReportFiltersSchema, 'query'),
  async (req: Request, res: Response<TaxReportResponse>) => {
    const filters = req.validated?.query as TaxReportFilters

    logger.info(`Fetching tax report with filters: ${JSON.stringify(filters)}`)

    try {
      const data = await getTaxReport(filters)
      res.json({
        data,
        filters,
      })
    } catch (error) {
      logger.error('Error fetching tax report:', error)
      return problem({
        status: HttpStatusCode.InternalServerError,
        detail: 'Failed to fetch tax report data.',
      })
    }
  },
)

export default router
