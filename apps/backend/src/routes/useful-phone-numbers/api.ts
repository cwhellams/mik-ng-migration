import { Router, type Request, type Response } from 'express'
import { HttpStatusCode } from 'axios'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '@mik/contracts/members'
import { problem } from '../response.ts'
import {
  getUsefulPhoneNumbers,
  getFlightPlanCentrePhoneNumber,
  createUsefulPhoneNumber,
  updateUsefulPhoneNumber,
  deleteUsefulPhoneNumber,
} from '../../db/useful-phone-number-queries.ts'
import {
  UsefulPhoneNumberSchema,
  UsefulPhoneNumberUpdateSchema,
  type UsefulPhoneNumberListResponse,
} from '@mik/contracts/useful-phone-numbers'

export const router = Router()

// GET /v1/useful-phone-numbers — public, used by the flight log wizard reminder
router.get('/', async (_req: Request, res: Response<UsefulPhoneNumberListResponse>) => {
  res.json(await getUsefulPhoneNumbers())
})

// GET /v1/useful-phone-numbers/flight-plan-centre — public convenience lookup
router.get('/flight-plan-centre', async (_req: Request, res: Response) => {
  const number = await getFlightPlanCentrePhoneNumber()
  if (!number) {
    return problem({ status: HttpStatusCode.NotFound, detail: 'No flight plan centre configured.' })
  }
  res.json(number)
})

// POST /v1/useful-phone-numbers — admin only
router.post('/', validateUser(MIKPermissions.MEMBER_ADMIN), async (req: Request, res: Response) => {
  const { label, phoneNumber, sortOrder } = UsefulPhoneNumberSchema.parse(req.body)
  const created = await createUsefulPhoneNumber(label, phoneNumber, sortOrder)
  res.status(HttpStatusCode.Created).json(created)
})

// PUT /v1/useful-phone-numbers/:label — admin only
router.put(
  '/:label',
  validateUser(MIKPermissions.MEMBER_ADMIN),
  async (req: Request<{ label: string }>, res: Response) => {
    const { phoneNumber, sortOrder } = UsefulPhoneNumberUpdateSchema.parse(req.body)
    const updated = await updateUsefulPhoneNumber(req.params.label, phoneNumber, sortOrder)
    if (!updated) {
      return problem({ status: HttpStatusCode.NotFound, detail: 'Phone number not found.' })
    }
    res.json(updated)
  },
)

// DELETE /v1/useful-phone-numbers/:label — admin only
router.delete(
  '/:label',
  validateUser(MIKPermissions.MEMBER_ADMIN),
  async (req: Request<{ label: string }>, res: Response) => {
    const deleted = await deleteUsefulPhoneNumber(req.params.label)
    if (!deleted) {
      return problem({ status: HttpStatusCode.NotFound, detail: 'Phone number not found.' })
    }
    res.status(HttpStatusCode.NoContent).send()
  },
)
