import { Router, type Request, type Response } from 'express'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '../members/models.ts'
import { problem } from '../response.ts'
import { UpsertMileageAllowanceSchema } from './mileageModels.ts'
import {
  getMileageAllowances,
  getCurrentMileageAllowance,
  upsertMileageAllowance,
} from '../../db/mileage-queries.ts'
import { HttpStatusCode } from 'axios'

export const mileageAllowanceRouter = Router()

// GET /v1/mileage-allowances  — list all years (authenticated users)
mileageAllowanceRouter.get(
  '/',
  validateUser(MIKPermissions.EXPENSE_ADMIN, MIKPermissions.EXPENSE_USER),
  async (_req: Request, res: Response) => {
    res.json(await getMileageAllowances())
  },
)

// GET /v1/mileage-allowances/current  — effective rate for the current year
mileageAllowanceRouter.get(
  '/current',
  validateUser(MIKPermissions.EXPENSE_ADMIN, MIKPermissions.EXPENSE_USER),
  async (_req: Request, res: Response) => {
    const allowance = await getCurrentMileageAllowance()
    if (!allowance) {
      return problem({
        status: HttpStatusCode.NotFound,
        detail: 'No mileage allowance found for the current year.',
      })
    }
    res.json(allowance)
  },
)

// PUT /v1/mileage-allowances  — upsert a year's allowance (EXPENSE_ADMIN only)
mileageAllowanceRouter.put(
  '/',
  validateUser(MIKPermissions.EXPENSE_ADMIN),
  async (req: Request, res: Response) => {
    const parsed = UpsertMileageAllowanceSchema.safeParse(req.body)
    if (!parsed.success) {
      return problem({ status: HttpStatusCode.BadRequest, detail: 'Invalid request body' })
    }
    const result = await upsertMileageAllowance(parsed.data, req.user!)
    res.json(result)
  },
)
