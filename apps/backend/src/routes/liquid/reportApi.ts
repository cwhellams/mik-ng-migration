import { Router, type Request, type Response } from 'express'

import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '@mik/contracts/members'
import {
  FuelPriceComparisonQuerySchema,
  type FuelPriceComparisonResponse,
} from '@mik/contracts/liquid'
import { getFuelPriceComparison } from '../../db/liquid-queries.ts'

export const reportRouter = Router()

/**
 * GET /v1/liquid/reports/fuel-price-comparison
 *
 * "A report for a selected date range that identifies fuelings whose litre price
 * exceeds the EFNU reference price entered at runtime."
 *
 * Reference prices are query params, not configuration: the question the report
 * answers is "was this more expensive than buying it at home *today*", and
 * today's home price is something the person running the report knows.
 *
 * Same audience as the fuel prices page it replaces — this is what
 * `/v1/fuel-report` should have been. That one read expense line items, so a
 * fuelling nobody claimed never appeared in it.
 */
reportRouter.get(
  '/fuel-price-comparison',
  validateUser(
    MIKPermissions.FUEL_PRICES_USER,
    MIKPermissions.FUEL_PRICES_ADMIN,
    MIKPermissions.LIQUID_ADMIN,
  ),
  async (req: Request, res: Response<FuelPriceComparisonResponse>) => {
    const query = FuelPriceComparisonQuerySchema.parse(req.query)
    res.json(await getFuelPriceComparison(query))
  },
)
