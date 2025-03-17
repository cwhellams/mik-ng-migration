import { Router } from 'express'
import type { Request, Response } from 'express'

import type { MemberListResponse, Member } from './models.ts'
import { getMember, getMemberRoles, getMembers } from '../../db/queries.ts'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKRoles } from '../auth/user.ts'
import type { ErrorResponse } from '../response.ts'

export const router = Router()
router.use(validateUser(MIKRoles.USER))

router.get('/', async (req: Request, res: Response<MemberListResponse>) => {
  const members = await getMembers()

  res.status(200).json({
    members: members,
  })
})

router.get('/me', async (req: Request, res: Response<Member | ErrorResponse>) => {
  const member = await getMember(req.user!.email)
  if (!member) {
    return res.status(404).json({ message: 'Not found' })
  }

  const roles = await getMemberRoles(member.member_id)

  res.status(200).json({
    memberId: member.member_id,
    memberType: member.member_type_id,
    email: member.email,
    firstName: member.first_name,
    lastName: member.last_name,
    iceContactName: member.ice_contact_name,
    iceContactPhoneNumber: member.ice_contact_phone_number,
    isTrainingProgramPilot: member.is_training_program_pilot,
    phoneNumber: member.phone_number,
    postcode: member.postcode,
    streetAddress: member.street_address,
    townCity: member.town_city,
    roles,
  })
})
