import { HttpStatusCode } from 'axios'
import { Router, type Request, type Response } from 'express'

import { validateUser } from '../../middleware/authMiddleware.ts'
import { problem } from '../response.ts'
import { MIKPermissions } from '@mik/contracts/members'
import { UpsertFuelTaxSchema, type FuelTax } from '@mik/contracts/liquid'
import { deleteFuelTax, listFuelTaxes, upsertFuelTax } from '../../db/liquid-queries.ts'
import { db } from '../../db/connection.ts'

export const fuelTaxRouter = Router()

/**
 * "Add administration UI for configuring the applicable fuel tax by calendar
 * year." The table is modelled on `accts.mileage_allowance` and so is this
 * router — read for anyone who submits expense claims (the claim form shows what
 * will be applied), write for the treasurer.
 */

fuelTaxRouter.get(
  '/',
  validateUser(
    MIKPermissions.EXPENSE_ADMIN,
    MIKPermissions.EXPENSE_USER,
    MIKPermissions.LIQUID_ADMIN,
    MIKPermissions.LIQUID_USER,
  ),
  async (_req: Request, res: Response<FuelTax[]>) => {
    res.json(await listFuelTaxes())
  },
)

/**
 * PUT — upsert one (year, fuel type) rate.
 *
 * Editing a rate never moves an existing claim: `linkRecordsToClaim` copies the
 * rate onto the record when the claim is made, so history is settled at that
 * point. This route only affects claims made from now on.
 */
fuelTaxRouter.put(
  '/',
  validateUser(MIKPermissions.EXPENSE_ADMIN),
  async (req: Request, res: Response<FuelTax>) => {
    const data = UpsertFuelTaxSchema.parse(req.body)

    // Guards against a typo creating a rate against a fuel nobody sells, which
    // would then silently never apply.
    const fuelType = await db
      .selectFrom('flight.fuelTypes')
      .select(['name'])
      .where('name', '=', data.fuelType)
      .executeTakeFirst()
    if (!fuelType) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: `Unknown fuel type ${data.fuelType}.`,
      })
    }

    res.json(await upsertFuelTax(data, req.user!.memberId!))
  },
)

fuelTaxRouter.delete(
  '/:taxYear/:fuelType',
  validateUser(MIKPermissions.EXPENSE_ADMIN),
  async (req: Request<{ taxYear: string; fuelType: string }>, res: Response) => {
    const taxYear = Number(req.params.taxYear)
    if (!Number.isInteger(taxYear)) {
      return problem({ status: HttpStatusCode.BadRequest, detail: 'taxYear must be a year.' })
    }
    await deleteFuelTax(taxYear, decodeURIComponent(req.params.fuelType))
    res.status(HttpStatusCode.NoContent).send()
  },
)
