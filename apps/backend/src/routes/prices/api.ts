import { Router } from 'express'
import type { Request, Response } from 'express'
import { HttpStatusCode } from 'axios'

import type { PublicPricesResponse } from './models.ts'
import {
  getCurrentAircraftPricing,
  getMembershipFees,
  getEquipmentFee,
} from '../../db/prices-queries.ts'
import logger from '../../lib/logger.ts'
import { problem } from '../response.ts'

export const router = Router()

// ─────────────────────────────────────────────────────────────────────────────
// Public endpoint – returns current pricing information (no auth required)
// This is consumed by the public marketing site (mikpublicweb) so it doesn't
// need to maintain duplicate price data.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/public', async (_req: Request, res: Response<PublicPricesResponse>) => {
  try {
    const [aircraft, membershipFees, equipmentFee] = await Promise.all([
      getCurrentAircraftPricing(),
      getMembershipFees(),
      getEquipmentFee(),
    ])

    return res.status(HttpStatusCode.Ok).json({
      aircraft,
      membershipFees,
      equipmentFee,
    })
  } catch (error) {
    logger.error(`Failed to fetch public prices: ${error}`)
    return problem({
      status: HttpStatusCode.InternalServerError,
      detail: 'Failed to fetch pricing information',
    })
  }
})
