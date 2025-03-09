import { Router, Request, Response } from 'express'
import { MemberListResponse } from './models'
import { authMiddleware } from '../../middleware/authMiddleware'
import { MIKRoles } from '../auth/tokens'
import { getMembers } from '../../db/queries'

export const router = Router()

router.use(authMiddleware(MIKRoles.USER))

router.get('/', async (req: Request, res: Response<MemberListResponse>) => {
  const members = await getMembers()

  res.status(200).json({
    members: members,
  })
})

router.get('/me', async (req: Request, res: Response<MemberListResponse>) => {
  res.status(200).json({
    members: [],
  })
})
