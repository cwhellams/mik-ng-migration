import { Router, type Request, type Response } from 'express'
import {
  RemarkFilterSchema,
  CreateRemarkSchema,
  type Remark,
  type RecentRemarksResponse,
} from '@mik/contracts/remarks'
import { getRemarksByFlightId, createRemark, getRecentRemarks } from '../../db/remark-queries.ts'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '@mik/contracts/members'

export const router = Router()

router.use(validateUser(MIKPermissions.FLIGHTLOG_USER, MIKPermissions.FLIGHTLOG_ADMIN))

const RECENT_REMARKS_DEFAULT_LIMIT = 10

// GET /v1/remarks/recent -- flight log admin dashboard's "recent remarks" list. Must
// come before GET /:flightId-shaped routes below it -- there are none here, but see
// the identical ordering note on the defects router if one is ever added.
router.get('/recent', async (req: Request, res: Response<RecentRemarksResponse>) => {
  const limit = req.query.limit
    ? Number.parseInt(req.query.limit as string)
    : RECENT_REMARKS_DEFAULT_LIMIT
  const remarks = await getRecentRemarks(limit)
  res.status(200).json({ remarks })
})

router.get('/', async (req: Request, res: Response<Remark[]>) => {
  const filters = RemarkFilterSchema.parse(req.query)
  const remarks = await getRemarksByFlightId(filters.flightId)
  res.status(200).json(remarks)
})

router.post('/', async (req: Request, res: Response<Remark>) => {
  const data = CreateRemarkSchema.parse(req.body)
  const remark = await createRemark(data, req.user!.memberId!)
  res.status(201).json(remark)
})

export default router
