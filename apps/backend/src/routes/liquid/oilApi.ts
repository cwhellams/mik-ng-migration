import { HttpStatusCode } from 'axios'
import { Router, type Request, type Response } from 'express'

import { validateUser } from '../../middleware/authMiddleware.ts'
import { problem } from '../response.ts'
import { MIKPermissions } from '@mik/contracts/members'
import {
  CreateOilCanisterSchema,
  OilCanisterFilterSchema,
  suggestCanisterRef,
  UpdateOilCanisterSchema,
  type OilCanister,
} from '@mik/contracts/liquid'
import {
  countCanistersByMake,
  countRecordsForCanister,
  createOilCanister,
  deleteOilCanister,
  getOilCanisterById,
  listOilCanisters,
  updateOilCanister,
} from '../../db/liquid-queries.ts'

export const oilRouter = Router()

/**
 * GET /v1/liquid/oil-canisters — available inventory.
 *
 * Readable by every liquid user, because a member reporting oil use has to pick
 * the canister they took off the shelf. Everything that changes inventory is
 * behind LIQUID_ADMIN below.
 */
oilRouter.get(
  '/',
  validateUser(MIKPermissions.LIQUID_USER, MIKPermissions.LIQUID_ADMIN),
  async (req: Request, res: Response<OilCanister[]>) => {
    res.json(await listOilCanisters(OilCanisterFilterSchema.parse(req.query)))
  },
)

/**
 * GET /v1/liquid/oil-canisters/suggest-ref?make=Aeroshell — the club's
 * `MIK <initials> <YY>/<seq>` label, pre-filled for the admin form.
 *
 * A suggestion, not an identity: the sequence is only right at the moment the
 * form opens, and the club may write something else on the tin. Must precede
 * `/:canisterId`.
 */
oilRouter.get(
  '/suggest-ref',
  validateUser(MIKPermissions.LIQUID_ADMIN),
  async (req: Request, res: Response<{ clubCanisterRef: string }>) => {
    const make = String(req.query.make ?? '').trim()
    if (!make) {
      return problem({ status: HttpStatusCode.BadRequest, detail: 'make is required.' })
    }
    res.json({
      clubCanisterRef: suggestCanisterRef(
        make,
        await countCanistersByMake(make),
        new Date().getFullYear(),
      ),
    })
  },
)

oilRouter.get(
  '/:canisterId',
  validateUser(MIKPermissions.LIQUID_USER, MIKPermissions.LIQUID_ADMIN),
  async (req: Request<{ canisterId: string }>, res: Response<OilCanister>) => {
    const canister = await getOilCanisterById(req.params.canisterId)
    if (!canister) {
      return problem({ status: HttpStatusCode.NotFound, detail: 'Oil canister not found.' })
    }
    res.json(canister)
  },
)

oilRouter.post(
  '/',
  validateUser(MIKPermissions.LIQUID_ADMIN),
  async (req: Request, res: Response<OilCanister>) => {
    const data = CreateOilCanisterSchema.parse(req.body)
    try {
      res.status(HttpStatusCode.Created).json(await createOilCanister(data, req.user!.memberId!))
    } catch (error) {
      // The club reference is UNIQUE, and typing an existing one is the obvious
      // mistake to make when several canisters of the same make arrive together.
      // Worth a 409 naming the reference rather than the generic 500 a bare
      // constraint violation produces.
      if ((error as { code?: string }).code === '23505') {
        return problem({
          status: HttpStatusCode.Conflict,
          detail: `A canister with reference "${data.clubCanisterRef}" already exists.`,
        })
      }
      throw error
    }
  },
)

/**
 * PATCH — everything but the aircraft, which is permanent from creation. An oil
 * record already filed against the canister names the aircraft the oil went
 * into, so moving it would rewrite history; the schema omits the field and a
 * database trigger refuses it even if something else tried.
 */
oilRouter.patch(
  '/:canisterId',
  validateUser(MIKPermissions.LIQUID_ADMIN),
  async (req: Request<{ canisterId: string }>, res: Response<OilCanister>) => {
    const data = UpdateOilCanisterSchema.parse(req.body)
    const updated = await updateOilCanister(req.params.canisterId, data, req.user!.memberId!)
    if (!updated) {
      return problem({ status: HttpStatusCode.NotFound, detail: 'Oil canister not found.' })
    }
    res.json(updated)
  },
)

/**
 * DELETE — only a canister nothing has been reported against.
 *
 * Once oil has been poured out of it the row is history, and history is marked
 * empty rather than deleted: `is_empty` is what takes it out of inventory.
 */
oilRouter.delete(
  '/:canisterId',
  validateUser(MIKPermissions.LIQUID_ADMIN),
  async (req: Request<{ canisterId: string }>, res: Response) => {
    const canister = await getOilCanisterById(req.params.canisterId)
    if (!canister) {
      return problem({ status: HttpStatusCode.NotFound, detail: 'Oil canister not found.' })
    }
    const used = await countRecordsForCanister(req.params.canisterId)
    if (used > 0) {
      return problem({
        status: HttpStatusCode.Conflict,
        detail: `${used} oil record(s) reference this canister. Mark it empty instead of deleting it.`,
      })
    }
    await deleteOilCanister(req.params.canisterId)
    res.status(HttpStatusCode.NoContent).send()
  },
)
