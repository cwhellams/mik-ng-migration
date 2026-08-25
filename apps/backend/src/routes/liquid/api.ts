import { Router } from 'express'

import { fuelTaxRouter } from './fuelTaxApi.ts'
import { oilRouter } from './oilApi.ts'
import { qrRouter } from './qrApi.ts'
import { recordsRouter } from './recordsApi.ts'
import { reportRouter } from './reportApi.ts'

/**
 * `/api/v1/liquid` — the Liquid Management System (#1119).
 *
 * Split by concern rather than served from one file, because the four halves have
 * genuinely different audiences: reporting is for every flying member, oil
 * inventory and QR codes are a liquid admin's job, the fuel tax belongs to the
 * treasurer, and the price report is for whoever maintains the fuel prices page.
 * Each sub-router carries its own `validateUser`.
 */
export const router = Router()

router.use('/oil-canisters', oilRouter)
router.use('/qr', qrRouter)
router.use('/fuel-tax', fuelTaxRouter)
router.use('/reports', reportRouter)
// Last: this one owns the bare paths (`/records`, `/providers`), so mounting it
// at '/' before the others would let its 404s shadow them.
router.use('/', recordsRouter)

export default router
