import { Router, Request, Response } from 'express'

import { MemberListResponse, Member } from './models'
import { getMember, getMembers } from '../../db/queries'
import { authMiddleware } from '../../middleware/authMiddleware'
import { MIKRoles } from '../auth/tokens'
import { ErrorResponse } from '../response'

export const router = Router()

// Only authenticated users can access this route
router.use(authMiddleware(MIKRoles.USER))

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
  })
})
