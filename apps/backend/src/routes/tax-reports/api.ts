import { Router, type Request, type Response } from 'express'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '../members/models.ts'
import { getTaxReport } from '../../db/tax-report-queries.ts'
import { TaxReportFiltersSchema, type TaxReportFilters, type TaxReportResponse } from './models.ts'
import { problem } from '../response.ts'
import { HttpStatusCode } from 'axios'
import logger from '../../lib/logger.ts'
import dayjs from 'dayjs'

const router = Router()

// Only INVOICING_ADMIN can access tax reports
router.use(validateUser(MIKPermissions.INVOICING_ADMIN))

router.get('/', async (req: Request, res: Response<TaxReportResponse>) => {
  const parsed = TaxReportFiltersSchema.safeParse(req.query)

  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
      code: issue.code,
    }))
    return problem({
      status: HttpStatusCode.BadRequest,
      detail: 'Invalid query parameters. startDate and endDate are required in YYYY-MM-DD format.',
      extensions: {
        errors,
      },
    })
  }

  const filters: TaxReportFilters = parsed.data

  // Validate that endDate is not in the future
  if (dayjs(filters.endDate).isAfter(dayjs(), 'day')) {
    return problem({
      status: HttpStatusCode.BadRequest,
      detail: 'End date cannot be in the future.',
    })
  }

  // Validate that startDate is not after endDate
  if (dayjs(filters.startDate).isAfter(dayjs(filters.endDate), 'day')) {
    return problem({
      status: HttpStatusCode.BadRequest,
      detail: 'Start date cannot be after end date.',
    })
  }

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
})

export default router
