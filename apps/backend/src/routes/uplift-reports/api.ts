import { Router, type Request, type Response } from 'express'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '../members/models.ts'
import { getUpliftReport } from '../../db/uplift-report-queries.ts'
import {
  UpliftReportFiltersSchema,
  type UpliftReportFilters,
  type UpliftReportResponse,
} from './models.ts'
import { problem } from '../response.ts'
import { HttpStatusCode } from 'axios'
import logger from '../../lib/logger.ts'
import dayjs from 'dayjs'

const router = Router()

// Only INVOICING_ADMIN can access uplift reports
router.use(validateUser(MIKPermissions.INVOICING_ADMIN))

router.get('/', async (req: Request, res: Response<UpliftReportResponse>) => {
  const parsed = UpliftReportFiltersSchema.safeParse(req.query)

  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
      code: issue.code,
    }))
    return problem({
      status: HttpStatusCode.BadRequest,
      detail: 'Invalid query parameters. aircraftRegistration, startDate and endDate are required.',
      extensions: { errors },
    })
  }

  const filters: UpliftReportFilters = parsed.data

  if (dayjs(filters.endDate).isAfter(dayjs(), 'day')) {
    return problem({
      status: HttpStatusCode.BadRequest,
      detail: 'End date cannot be in the future.',
    })
  }

  if (dayjs(filters.startDate).isAfter(dayjs(filters.endDate), 'day')) {
    return problem({
      status: HttpStatusCode.BadRequest,
      detail: 'Start date cannot be after end date.',
    })
  }

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
})

export default router
