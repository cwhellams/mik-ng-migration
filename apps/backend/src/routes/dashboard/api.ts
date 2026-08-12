import { Router } from 'express'
import type { Request, Response } from 'express'

import type { JWTUser } from '../auth/token.ts'
import { problem } from '../response.ts'
import { HttpStatusCode } from 'axios'
import { DashboardSettingsSchema, DEFAULT_DASHBOARD_COMPONENTS } from '@mik/contracts/dashboard'

import logger from '../../lib/logger.ts'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { getDashboardSettings, setDashboardSettings } from '../../db/member-queries.ts'

export const router = Router()

router.use(validateUser())
/**
 * GET /v1/dashboard/settings
 * Retrieve the current user's dashboard settings
 */
router.get('/settings', async (req: Request, res: Response) => {
  const user = req.user as JWTUser

  const dashboardSettings = await getDashboardSettings(user.memberId)

  // If no settings exist, return default configuration
  if (!dashboardSettings) {
    return res.status(HttpStatusCode.Ok).json({
      components: DEFAULT_DASHBOARD_COMPONENTS,
    })
  }

  return res.status(HttpStatusCode.Ok).json(dashboardSettings)
})

/**
 * PUT /api/v1/dashboard/settings
 * Update the current user's dashboard settings
 */
router.put('/settings', async (req: Request, res: Response) => {
  const user = req.user as JWTUser

  logger.info(`Updating dashboard settings for member ID ${user.memberId}`)
  // Validate request body
  const validationResult = DashboardSettingsSchema.safeParse(req.body)
  if (!validationResult.success) {
    return problem({
      status: HttpStatusCode.BadRequest,
      detail: 'Invalid dashboard settings',
      extensions: {
        errors: validationResult.error.issues,
      },
    })
  }

  const settings = validationResult.data

  try {
    await setDashboardSettings(user.memberId, settings)
    return res.status(HttpStatusCode.Ok).json(settings)
  } catch (error) {
    logger.error(`Failed to update dashboard settings for member ID ${user.memberId}: ${error}`)
    return problem({
      status: HttpStatusCode.InternalServerError,
      detail: 'Failed to update dashboard settings',
    })
  }
})
