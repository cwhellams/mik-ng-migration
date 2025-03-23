import { Router } from 'express'
import type { Request, Response } from 'express'

import { type MemberListResponse, type Member, MIKRoles, MemberProfileSchema } from './models.ts'
import { getMemberById, getMembers, updateMember } from '../../db/queries.ts'
import { validateUser } from '../../middleware/authMiddleware.ts'
import type { ErrorResponse } from '../response.ts'

export const router = Router()

router.get(
  '/',
  // Only validated members can list other members
  validateUser(MIKRoles.USER),
  async (req: Request, res: Response<MemberListResponse>) => {
    const members = await getMembers()

    res.status(200).json({
      members: members,
    })
  },
)

router.get(
  '/me',
  // anyone can fetch their own details
  validateUser(),
  async (req: Request, res: Response<Member | ErrorResponse>) => {
    const member = await getMemberById(req.user!.memberId)
    if (!member) {
      return res.status(404).json({ message: 'Not found' })
    }
    res.status(200).json(member)
  },
)

router.patch(
  '/me',
  // anyone can update their own (limited) details
  validateUser(),
  async (req: Request, res: Response<Member | ErrorResponse>): Promise<void> => {
    // only subset of member fields are editable here, the rest are skipped
    const patch = MemberProfileSchema.partial().parse(req.body)

    await updateMember(req.user?.memberId!, patch, req.user!)

    const member = await getMemberById(req.user!.memberId)
    res.status(200).json(member)
  },
)
