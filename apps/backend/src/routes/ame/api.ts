import { HttpStatusCode } from 'axios'
import { Router, type Request, type Response } from 'express'
import { validateUser } from '../../middleware/authMiddleware.ts'
import {
  approveAmeEntry,
  createAmeEntry,
  getAllAmeEntries,
  getApprovedAmeEntries,
  getPendingAmeCount,
  rejectAmeEntry,
} from '../../db/ame-queries.ts'
import { MIKPermissions } from '../members/models.ts'
import { problem } from '../response.ts'
import { AmeListFiltersSchema, CreateAmeEntrySchema, RejectAmeEntrySchema } from './models.ts'

export const router = Router()

router.get(
  '/',
  validateUser(MIKPermissions.MEMBER, MIKPermissions.MEMBER_ADMIN),
  async (req: Request, res: Response) => {
    const parsed = AmeListFiltersSchema.safeParse(req.query)
    if (!parsed.success) {
      return problem({ status: HttpStatusCode.BadRequest, detail: 'Invalid query parameters' })
    }
    const result = await getApprovedAmeEntries(parsed.data)
    return res.json(result)
  },
)

router.post(
  '/',
  validateUser(MIKPermissions.AME_USER, MIKPermissions.AME_ADMIN),
  async (req: Request, res: Response) => {
    const parsed = CreateAmeEntrySchema.safeParse(req.body)
    if (!parsed.success) {
      return problem({ status: HttpStatusCode.BadRequest, detail: parsed.error.message })
    }
    const entry = await createAmeEntry(parsed.data, req.user!)
    return res.status(HttpStatusCode.Created).json(entry)
  },
)

router.get(
  '/admin/pending/count',
  validateUser(MIKPermissions.AME_ADMIN),
  async (_req: Request, res: Response) => {
    const count = await getPendingAmeCount()
    return res.json({ count })
  },
)

router.get(
  '/admin/all',
  validateUser(MIKPermissions.AME_ADMIN),
  async (req: Request, res: Response) => {
    const parsed = AmeListFiltersSchema.safeParse(req.query)
    if (!parsed.success) {
      return problem({ status: HttpStatusCode.BadRequest, detail: 'Invalid query parameters' })
    }
    const result = await getAllAmeEntries(parsed.data)
    return res.json(result)
  },
)

router.post(
  '/:id/approve',
  validateUser(MIKPermissions.AME_ADMIN),
  async (req: Request, res: Response) => {
    const entry = await approveAmeEntry(String(req.params.id), req.user!)
    if (!entry) {
      return problem({
        status: HttpStatusCode.NotFound,
        detail: 'Entry not found or already processed',
      })
    }
    return res.json(entry)
  },
)

router.post(
  '/:id/reject',
  validateUser(MIKPermissions.AME_ADMIN),
  async (req: Request, res: Response) => {
    const parsed = RejectAmeEntrySchema.safeParse(req.body)
    if (!parsed.success) {
      return problem({ status: HttpStatusCode.BadRequest, detail: parsed.error.message })
    }
    const entry = await rejectAmeEntry(String(req.params.id), req.user!, parsed.data.reason)
    if (!entry) {
      return problem({
        status: HttpStatusCode.NotFound,
        detail: 'Entry not found or already processed',
      })
    }
    return res.json(entry)
  },
)
