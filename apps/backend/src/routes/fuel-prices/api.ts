import { Router } from 'express'
import type { Request, Response } from 'express'

import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '../members/models.ts'
import { type FuelPrices, FuelPricesUpdateSchema, UpsertLocalFuelPriceSchema } from './models.ts'
import { getFuelPricesMarkdown, setFuelPricesMarkdown } from '../../db/fuel-prices-queries.ts'
import { getLocalFuelPrices, createLocalFuelPrice } from '../../db/local-fuel-price-queries.ts'
import { renderMarkdown } from '../../util/markdown.ts'

export const router = Router()

// ─── Local (EFNU) fuel price cap, per fuel type (issue #955) ────────────────────

router.get(
  '/local',
  validateUser(MIKPermissions.FUEL_PRICES_USER, MIKPermissions.FUEL_PRICES_ADMIN),
  async (_req: Request, res: Response) => {
    res.status(200).json({ prices: await getLocalFuelPrices() })
  },
)

router.post(
  '/local',
  validateUser(MIKPermissions.FUEL_PRICES_ADMIN),
  async (req: Request, res: Response) => {
    const payload = UpsertLocalFuelPriceSchema.parse(req.body)
    const price = await createLocalFuelPrice(payload, req.user!)
    res.status(201).json(price)
  },
)

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
