import { Router } from 'express'
import type { Request, Response } from 'express'

import {
  type MemberListResponse,
  type Member,
  MIKPermissions,
  MemberProfileSchema,
  MemberSchema,
  type MemberListFilters,
  type MemberRolesResponse,
  type MemberRole,
  MemberRoleSchema,
  type MemberApproval,
} from './models.ts'
import {
  getMemberById,
  getAllMemberRoles,
  getMembers,
  updateMember,
  getAllMemberRoleById,
  updateMemberRole,
  addMemberRole,
  removeMemberRole,
  addMember,
  removeMember,
  getMembersAwaitingApproval,
  setMembershipApproval,
} from '../../db/member-queries.ts'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { UpsertSchema } from '../../types/schema.ts'
import { RegisterRequestSchema } from '../auth/schema.ts'
import type { JWTUser } from '../auth/token.ts'
import { problem } from '../response.ts'
import { HttpStatusCode } from 'axios'
import { sendEmail } from '../../lib/sendGmail.ts'
import {
  membershipApprovedEmailBodyHtml,
  membershipApprovedEmailPlainText,
  membershipApprovedEmailSubject,
} from '../../templates/newMemberApprovedEmailTemplate.ts'

export const router = Router()

const isMemberAdmin = (user?: JWTUser): boolean =>
  user?.permissions?.includes(MIKPermissions.MEMBER_ADMIN) ?? false

router.get(
  '/awaiting-approval',
  validateUser(MIKPermissions.MEMBER_ADMIN),
  async (req: Request, res: Response<Member[]>) => {
    const membersAwaitingApproval = await getMembersAwaitingApproval()
    res.status(HttpStatusCode.Ok).json(membersAwaitingApproval)
  },
)

router.post(
  '/:memberId/approve',
  validateUser(MIKPermissions.MEMBER_ADMIN),
  async (req: Request<{ memberId: string }>, res: Response<MemberApproval>) => {
    const memberId = req.params.memberId

    const approval = await setMembershipApproval(memberId, req.user!.memberId)
    if (!approval) {
      return problem({ status: HttpStatusCode.NotFound })
    }

    sendEmail(
      approval.email,
      membershipApprovedEmailSubject('en'),
      membershipApprovedEmailBodyHtml('en', { firstName: approval.firstName }),
      membershipApprovedEmailPlainText('en', { firstName: approval.firstName }),
    )

    res.status(HttpStatusCode.Created).json(approval)
  },
)

router.get(
  '/',
  // Only validated members can list other members
  validateUser(MIKPermissions.MEMBER, MIKPermissions.MEMBER_ADMIN),
  async (req: Request<{}, {}, {}, MemberListFilters>, res: Response<MemberListResponse>) => {
    const { name, role, isMembershipApproved } = req.query

    // either no roles filter, or one/multiple roles
    const roles = role ? (Array.isArray(role) ? role : [role]) : []

    const members = await getMembers(
      isMemberAdmin(req.user),
      name,

      // map query of unapproved members to null
      roles,
      isMembershipApproved,
    )

    res.status(200).json({
      members: members,
    })
  },
)

router.get(
  '/me',
  // anyone can fetch their own details
  validateUser(),
  async (req: Request, res: Response<Member>) => {
    const member = await getMemberById(req.user!.memberId)
    if (!member) {
      return problem({ status: 404 })
    }
    res.status(200).json(member)
  },
)

router.patch(
  '/me',
  // anyone can update their own (limited) details
  validateUser(),
  async (req: Request, res: Response<Member>): Promise<void> => {
    // only subset of member fields are editable here, the rest are skipped
    const patch = MemberProfileSchema.partial().parse(req.body)

    await updateMember(req.user?.memberId!, patch, req.user!)

    const member = await getMemberById(req.user!.memberId)
    res.status(200).json(member)
  },
)

// list roles and permissions
router.get(
  '/roles',
  validateUser(MIKPermissions.MEMBER, MIKPermissions.MEMBER_ADMIN),
  async (req: Request, res: Response<MemberRolesResponse>) => {
    if (isMemberAdmin(req.user)) {
      // admin can see all roles and permissions
      res.status(200).json({
        roles: await getAllMemberRoles(),
        permissions: Object.values(MIKPermissions),
      })
    } else {
      // normal users can see only public roles without permissions
      const roles = await getAllMemberRoles(true)
      res.status(200).json({
        roles: roles.map(role => ({ ...role, permissions: [] })),
        permissions: [],
      })
    }
  },
)

//
// Admin only role routes
//

router.get(
  '/roles/:roleId',
  validateUser(MIKPermissions.MEMBER_ADMIN),
  async (req: Request<{ roleId: string }>, res: Response<MemberRole>) => {
    const role = await getAllMemberRoleById(req.params.roleId)
    if (!role) {
      return problem({ status: 404 })
    }
    res.status(200).json(role)
  },
)

router.patch(
  '/roles/:roleId',
  validateUser(MIKPermissions.MEMBER_ADMIN),
  async (req: Request<{ roleId: string }>, res: Response<MemberRole>) => {
    const patch = MemberRoleSchema.partial().parse(req.body)
    const success = await updateMemberRole(req.params.roleId, patch, req.user!)
    if (!success) {
      return problem({ status: 404 })
    }

    const role = await getAllMemberRoleById(req.params.roleId)
    res.status(200).json(role)
  },
)

router.post(
  '/roles',
  validateUser(MIKPermissions.MEMBER_ADMIN),
  async (req: Request, res: Response<MemberRole>) => {
    const role = UpsertSchema(MemberRoleSchema).parse(req.body)
    const created = await addMemberRole(role, req.user!)

    res.status(200).json(created)
  },
)

router.delete(
  '/roles/:roleId',
  validateUser(MIKPermissions.MEMBER_ADMIN),
  async (req: Request<{ roleId: string }>, res: Response) => {
    const success = await removeMemberRole(req.params.roleId)
    if (!success) {
      return problem({ status: 404 })
    }

    res.status(204).end()
  },
)

//
// Admin only member routes
//

router.post(
  '/approve/:memberId',
  validateUser(MIKPermissions.MEMBER_ADMIN),
  async (req: Request, res: Response<MemberApproval>) => {
    const created = await setMembershipApproval(req.params.memberId, req.user?.memberId!)
    created ? res.status(HttpStatusCode.Ok).json(created) : res.status(HttpStatusCode.NotFound)
  },
)

router.post(
  '/',
  validateUser(MIKPermissions.MEMBER_ADMIN),
  async (req: Request, res: Response<Member>) => {
    const member = RegisterRequestSchema.parse(req.body)
    const memberId = await addMember(member, req.user)
    const created = await getMemberById(memberId)
    res.status(200).json(created)
  },
)

router.get(
  '/:memberId',
  validateUser(MIKPermissions.MEMBER_ADMIN),
  async (req: Request<{ memberId: string }>, res: Response<Member>) => {
    const memberId = req.params.memberId

    const member = await getMemberById(memberId)
    if (!member) {
      return problem({ status: 404 })
    }
    res.status(200).json(member)
  },
)

router.patch(
  '/:memberId',
  validateUser(MIKPermissions.MEMBER_ADMIN),
  async (req: Request<{ memberId: string }>, res: Response<Member>) => {
    const memberId = req.params.memberId

    const patch = MemberSchema.partial().parse(req.body)
    const updated = await updateMember(memberId, patch, req.user!)
    if (!updated) {
      return problem({ status: 404 })
    }

    const member = await getMemberById(memberId)
    res.status(200).json(member)
  },
)

router.delete(
  '/:memberId',
  validateUser(MIKPermissions.MEMBER_ADMIN),
  async (req: Request<{ memberId: string }>, res: Response) => {
    const memberId = req.params.memberId

    const updated = await removeMember(memberId)
    if (!updated) {
      return problem({ status: 404 })
    }

    res.status(204).end()
  },
)
