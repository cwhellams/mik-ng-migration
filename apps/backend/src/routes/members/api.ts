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
} from './models.ts'
import {
  getMemberById,
  getAllMemberRoles,
  getMembers,
  updateMember,
  getAllMemberRoleById,
  updateMemberRole,
} from '../../db/member-queries.ts'
import { validateUser } from '../../middleware/authMiddleware.ts'
import type { JWTUser } from '../auth/token.ts'
import type { ErrorResponse } from '../response.ts'

export const router = Router()

const isMemberAdmin = (user?: JWTUser): boolean =>
  user?.permissions?.includes(MIKPermissions.MEMBER_ADMIN) ?? false

router.get(
  '/',
  // Only validated members can list other members
  validateUser(MIKPermissions.MEMBER, MIKPermissions.MEMBER_ADMIN),
  async (req: Request<{}, {}, {}, MemberListFilters>, res: Response<MemberListResponse>) => {
    const { name, role } = req.query

    // either no roles filter, or one/multiple roles
    const roles = role ? (Array.isArray(role) ? role : [role]) : undefined

    const members = await getMembers(isMemberAdmin(req.user), name, roles ?? [])

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
  async (req: Request<{ roleId: string }>, res: Response<MemberRole | ErrorResponse>) => {
    const role = await getAllMemberRoleById(req.params.roleId)
    if (!role) {
      return res.status(404).json({ message: 'Not found' })
    }
    res.status(200).json(role)
  },
)

router.patch(
  '/roles/:roleId',
  validateUser(MIKPermissions.MEMBER_ADMIN),
  async (req: Request<{ roleId: string }>, res: Response<MemberRole | ErrorResponse>) => {
    const patch = MemberRoleSchema.partial().parse(req.body)
    await updateMemberRole(req.params.roleId, patch, req.user!)

    const role = await getAllMemberRoleById(req.params.roleId)
    res.status(200).json(role)
  },
)

//
// Admin only member routes
//

router.get(
  '/:memberId',
  validateUser(MIKPermissions.MEMBER_ADMIN),
  async (req: Request<{ memberId: string }>, res: Response<Member | ErrorResponse>) => {
    const memberId = Number(req.params.memberId)

    const member = await getMemberById(memberId)
    if (!member) {
      return res.status(404).json({ message: 'Not found' })
    }
    res.status(200).json(member)
  },
)

router.patch(
  '/:memberId',
  validateUser(MIKPermissions.MEMBER_ADMIN),
  async (req: Request<{ memberId: string }>, res: Response<Member | ErrorResponse>) => {
    const memberId = Number(req.params.memberId)

    const patch = MemberSchema.partial().parse(req.body)
    await updateMember(memberId, patch, req.user!)

    const member = await getMemberById(memberId)
    res.status(200).json(member)
  },
)
