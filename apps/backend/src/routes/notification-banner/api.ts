import { Router } from 'express'
import type { Request, Response } from 'express'

import { HttpStatusCode } from 'axios'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '../members/models.ts'
import { UpdateNotificationBannerSchema, type NotificationBanner } from './models.ts'
import {
  getNotificationBanner,
  setNotificationBanner,
} from '../../db/notification-banner-queries.ts'
import { problem } from '../response.ts'
import logger from '../../lib/logger.ts'

export const router = Router()

/**
 * GET /api/v1/notification-banner
 * Public endpoint – returns the current notification banner (message may be null).
 */
router.get('/', async (_req: Request, res: Response<NotificationBanner>) => {
  const banner = await getNotificationBanner()
  return res.status(HttpStatusCode.Ok).json(banner)
})

/**
 * PUT /api/v1/notification-banner
 * Admin-only – update the notification banner content.
 */
router.put(
  '/',
  validateUser(MIKPermissions.MEMBER_ADMIN),
  async (req: Request, res: Response<NotificationBanner>) => {
    const parsed = UpdateNotificationBannerSchema.safeParse(req.body)
    if (!parsed.success) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: 'Invalid notification banner data',
        extensions: { errors: parsed.error.errors },
      })
    }

    try {
      await setNotificationBanner(parsed.data, req.user!)
      logger.info(`Notification banner updated by ${req.user!.memberId}`)
      return res.status(HttpStatusCode.Ok).json(parsed.data)
    } catch (error) {
      logger.error(`Failed to update notification banner: ${error}`)
      return problem({
        status: HttpStatusCode.InternalServerError,
        detail: 'Failed to update notification banner',
      })
    }
  },
)
