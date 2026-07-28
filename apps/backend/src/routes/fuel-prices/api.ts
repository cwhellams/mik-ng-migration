import { Router } from 'express'
import type { Request, Response } from 'express'

import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '../members/models.ts'
import { type FuelPrices, FuelPricesUpdateSchema } from './models.ts'
import { getFuelPricesMarkdown, setFuelPricesMarkdown } from '../../db/fuel-prices-queries.ts'
import { renderMarkdown } from '../../util/markdown.ts'

export const router = Router()

router.get(
  '/',
  validateUser(MIKPermissions.FUEL_PRICES_USER, MIKPermissions.FUEL_PRICES_ADMIN),
  async (_req: Request, res: Response<FuelPrices>) => {
    const markdown = await getFuelPricesMarkdown()
    res.status(200).json({
      markdown,
      renderedHtml: renderMarkdown(markdown),
    })
  },
)

router.patch(
  '/',
  validateUser(MIKPermissions.FUEL_PRICES_ADMIN),
  async (req: Request, res: Response<FuelPrices>) => {
    const payload = FuelPricesUpdateSchema.parse(req.body)
    await setFuelPricesMarkdown(payload.markdown, req.user!)

    res.status(200).json({
      markdown: payload.markdown,
      renderedHtml: renderMarkdown(payload.markdown),
    })
  },
)
