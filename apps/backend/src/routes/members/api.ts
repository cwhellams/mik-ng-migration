import { Router } from 'express'
import type { Request, Response } from 'express'

import { type MemberListResponse, type Member, MIKRoles } from './models.ts'
import { getMember, getMembers } from '../../db/queries.ts'
import { validateUser } from '../../middleware/authMiddleware.ts'
import type { ErrorResponse } from '../response.ts'

export const router = Router()

router.get(
  '/',
  validateUser(MIKRoles.USER),
  async (req: Request, res: Response<MemberListResponse>) => {
    const members = await getMembers()

    res.status(200).json({
      members: members,
    })
  },
)

router.get('/me', validateUser(), async (req: Request, res: Response<Member | ErrorResponse>) => {
  const member = await getMember(req.user!.email)
  if (!member) {
    return res.status(404).json({ message: 'Not found' })
  }
  res.status(200).json(member)
})
