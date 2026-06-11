import { Router, type Request, type Response } from 'express'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '../members/models.ts'
import { getInstructorWorktime } from '../../db/instructor-worktime-queries.ts'
import {
  InstructorWorktimeFiltersSchema,
  type InstructorWorktimeFilters,
  type InstructorWorktimeResponse,
} from './models.ts'
import { problem } from '../response.ts'
import { HttpStatusCode } from 'axios'
import logger from '../../lib/logger.ts'
import dayjs from 'dayjs'

const router = Router()

// Only FLIGHTLOG_ADMIN or INVOICING_ADMIN can access instructor worktime reports
router.use(validateUser(MIKPermissions.FLIGHTLOG_ADMIN, MIKPermissions.INVOICING_ADMIN))

router.get('/', async (req: Request, res: Response<InstructorWorktimeResponse>) => {
  const parsed = InstructorWorktimeFiltersSchema.safeParse(req.query)

  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
      code: issue.code,
    }))
    return problem({
      status: HttpStatusCode.BadRequest,
      detail:
        'Invalid query parameters. startDate and endDate are required in YYYY-MM-DD format. timeType is optional (block or air).',
      extensions: { errors },
    })
  }

  const filters: InstructorWorktimeFilters = parsed.data

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

  logger.info(`Fetching instructor worktime report with filters: ${JSON.stringify(filters)}`)

  try {
    const data = await getInstructorWorktime(filters)
    res.json({ data, filters })
  } catch (error) {
    logger.error('Error fetching instructor worktime report:', error)
    return problem({
      status: HttpStatusCode.InternalServerError,
      detail: 'Failed to fetch instructor worktime report data.',
    })
  }
})

export default router
