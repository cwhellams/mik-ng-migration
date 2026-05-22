import { Router } from 'express'
import type { Request, Response } from 'express'
import { HttpStatusCode } from 'axios'

import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '../members/models.ts'
import type { AppConfig } from './models.ts'

export const router = Router()

/**
 * GET /v1/config
 * Returns runtime feature flags derived from server environment variables.
 * Available to any authenticated member.
 */
router.get('/', validateUser(MIKPermissions.MEMBER), (_req: Request, res: Response<AppConfig>) => {
  const config: AppConfig = {
    medicalCheckEnabled: process.env.MEDICAL_CHECK_ENABLED !== 'false',
  }
  return res.status(HttpStatusCode.Ok).json(config)
})
