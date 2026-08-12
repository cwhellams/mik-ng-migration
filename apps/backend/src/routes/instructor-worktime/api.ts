import { Router, type Request, type Response } from 'express'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '@mik/contracts/members'
import { getInstructorWorktime } from '../../db/instructor-worktime-queries.ts'
import {
  InstructorWorktimeFiltersSchema,
  type InstructorWorktimeFilters,
  type InstructorWorktimeResponse,
} from '@mik/contracts/instructor-worktime'
import { problem } from '../response.ts'
import { validate } from '../validate.ts'
import { HttpStatusCode } from 'axios'
import logger from '../../lib/logger.ts'

const router = Router()

// Only FLIGHTLOG_ADMIN or INVOICING_ADMIN can access instructor worktime reports
router.use(validateUser(MIKPermissions.FLIGHTLOG_ADMIN, MIKPermissions.INVOICING_ADMIN))

router.get(
  '/',
  validate(InstructorWorktimeFiltersSchema, 'query'),
  async (req: Request, res: Response<InstructorWorktimeResponse>) => {
    const filters = req.validated?.query as InstructorWorktimeFilters

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
  },
)

export default router
