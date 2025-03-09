import { Router, Request, Response } from 'express'
import { MemberListResponse } from './models'
import { getMembers } from '../../db/queries'

export const router = Router()

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
