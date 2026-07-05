import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '../members/models.ts'
import { problem } from '../response.ts'
import { HttpStatusCode } from 'axios'
import {
  getCostCentres,
  createCostCentre,
  updateCostCentre,
  deleteCostCentre,
} from '../../db/cost-centre-queries.ts'

export const router = Router()

const CostCentreBodySchema = z.object({
  code: z.string().min(1).max(50),
  description: z.string().min(1).max(200),
})

// GET /v1/cost-centres — available to all expense users
router.get(
  '/',
  validateUser(MIKPermissions.EXPENSE_USER, MIKPermissions.EXPENSE_ADMIN),
  async (_req: Request, res: Response) => {
    res.json(await getCostCentres())
  },
)

// POST /v1/cost-centres — admin only
router.post(
  '/',
  validateUser(MIKPermissions.EXPENSE_ADMIN),
  async (req: Request, res: Response) => {
    const { code, description } = CostCentreBodySchema.parse(req.body)
    const existing = await getCostCentres()
    if (existing.some((c) => c.code === code)) {
      return problem({
        status: HttpStatusCode.Conflict,
        detail: `Cost centre '${code}' already exists.`,
      })
    }
    const created = await createCostCentre(code, description)
    res.status(HttpStatusCode.Created).json(created)
  },
)

// PUT /v1/cost-centres/:code — admin only
router.put(
  '/:code',
  validateUser(MIKPermissions.EXPENSE_ADMIN),
  async (req: Request, res: Response) => {
    const { description } = z.object({ description: z.string().min(1).max(200) }).parse(req.body)
    const updated = await updateCostCentre(req.params.code, description)
    if (!updated) {
      return problem({ status: HttpStatusCode.NotFound, detail: 'Cost centre not found.' })
    }
    res.json(updated)
  },
)

// DELETE /v1/cost-centres/:code — admin only
router.delete(
  '/:code',
  validateUser(MIKPermissions.EXPENSE_ADMIN),
  async (req: Request, res: Response) => {
    const deleted = await deleteCostCentre(req.params.code)
    if (!deleted) {
      return problem({ status: HttpStatusCode.NotFound, detail: 'Cost centre not found.' })
    }
    res.status(HttpStatusCode.NoContent).send()
  },
)
