import { type Selectable } from 'kysely'
import { jsonArrayFrom } from 'kysely/helpers/postgres'

import { db } from './connection.ts'
import type { MemberRegister, MemberRoles } from './schema.js'
import type { RegisterRequest } from '../routes/auth/schema.ts'
import type { JWTUser } from '../routes/auth/token.ts'
import {
  MIKLang,
  MIKMemberTypes,
  MIKPermissions,
  type Member,
  type MemberApproval,
  type MemberList,
  type MemberRole,
} from '../routes/members/models.ts'
import { problem } from '../routes/response.ts'
import type { Upsert } from '../types/schema.ts'
import { generateShortId } from '../util/nanoId.ts'
import { randomUUID } from 'node:crypto'
import { SimplbooksEventType } from '../services/simplbooks/models.ts'
import { z } from 'zod'

export async function getMemberById(memberId: string): Promise<Member | undefined> {
  const member = await db
    .selectFrom('member.register')
    .selectAll()
    .where('member_id', '=', memberId)
    .executeTakeFirst()

  if (member !== undefined) {
    return toMember(member, await getMemberRolesByMemberId(memberId))
  }
}

// Get member using email
export async function getMemberByEmail(email: string): Promise<Member | undefined> {
  const member = await db
    .selectFrom('member.register')
    .selectAll()
    .where('email', '=', email.toLowerCase())
    .executeTakeFirst()
  if (member !== undefined) {
    return toMember(member, await getMemberRolesByMemberId(member.member_id))
  }
}

function toMember(member: Selectable<MemberRegister>, roles: MemberRole[]): Member {
  return {
    memberId: member.member_id,
    memberType: member.member_type as MIKMemberTypes,
    email: member.email,
    firstName: member.first_name,
    lastName: member.last_name,

    phoneNumber: member.phone_number,
    postcode: member.postcode,
    streetAddress: member.street_address,
    townCity: member.town_city,

    iceContactName: member.ice_contact_name,
    iceContactPhoneNumber: member.ice_contact_phone_number,

    isTrainingProgramPilot: member.is_training_program_pilot,
    canMakeReservations: member.can_make_reservations,
    billingId: member.billing_id,
    dateOfBirth: member.date_of_birth,
    memberSince: member.member_since,

    createdAt: member.created_at.toISOString(),
    createdBy: member.created_by,
    updatedAt: member.updated_at.toISOString(),
    updatedBy: member.updated_by,
    emailVerifiedAt: member.email_verified_at?.toISOString(),

    licenceId: member.licence_id ?? undefined,
    licenceExpiry: member.licence_expiry_date,
    medicalExpiry: member.medical_expiry_date,

    isMembershipApproved: member.is_membership_approved,
    membershipApprovedAt: member.membership_approved_at?.toISOString(),
    membershipApprovedBy: member.membership_approved_by ?? undefined,

    lang: member.lang_iso639 as MIKLang,
    roles: roles,
  }
}

// only public roles are visible to non-admins
const getPublicRolesToQuery = async (publicRoles: string[], roles: (string | null)[]) => {
  const allowedRoles = roles
    // drop unapproved members
    .filter(role => role != null)
    // drop other than public roles
    .filter(role => publicRoles.includes(role))

  if (allowedRoles.length > 0) {
    return allowedRoles
  }

  // if no valid roles are found, show all public roles
  return publicRoles
}

export async function getMembers(
  isAdmin: boolean,
  name: string | undefined,
  roles: (string | null)[],
  isMembershipApproved: boolean | undefined,
): Promise<MemberList[]> {
  // admin can search any roles
  const publicRoles = (await getAllMemberRoles(true)).map(role => role.roleId)
  const filterRoles = isAdmin ? roles : await getPublicRolesToQuery(publicRoles, roles)

  let list = await db
    .selectFrom('member.register')
    .select(eb => [
      'member.register.member_id',
      'first_name',
      'last_name',
      'phone_number',
      'email',
      jsonArrayFrom(
        eb
          .selectFrom('member.member_to_roles')
          .select('role_id')
          .whereRef('member.member_to_roles.member_id', '=', 'member.register.member_id')
          .orderBy('role_id'),
      ).as('roles'),
    ])

    // query by name
    .$if(!!name, qb =>
      qb.where(eb => eb('first_name', 'ilike', `${name}%`).or('last_name', 'ilike', `${name}%`)),
    )
    .$if(isAdmin && !!isMembershipApproved, qb =>
      qb.where('is_membership_approved', '=', isMembershipApproved ?? true),
    )

    .$if(!isAdmin, qb => qb.where('is_membership_approved', '=', true))

    // hide external users from non-admins
    //.$if(!isAdmin, qb => qb.where('member_type', '!=', 'EXTERNAL'))

    // query users with roles
    .$if(filterRoles.length > 0, qb =>
      qb.where(eb =>
        eb.or(
          filterRoles.map(role =>
            eb.exists(
              eb
                .selectFrom('member.member_to_roles')
                .whereRef('member.register.member_id', '=', 'member.member_to_roles.member_id')
                .where('role_id', '=', role),
            ),
          ),
        ),
      ),
    )
    .orderBy('last_name')
    .orderBy('first_name')
    .execute()

  return list.map(member => ({
    memberId: member.member_id,
    first: member.first_name,
    last: member.last_name,
    phoneNumber: member.phone_number,
    email: member.email,
    roles: member.roles
      .map(role => role.role_id)
      .filter(role => isAdmin || publicRoles.includes(role)),
  }))
}

export async function addMember(member: RegisterRequest, jwt?: JWTUser): Promise<string> {
  const now = new Date()
  const new_member_id = generateShortId()

  const insRetval = await db
    .insertInto('member.register')
    .values({
      member_id: new_member_id,
      member_type: member.memberType,
      email: member.email.toLowerCase(),
      first_name: member.firstName,
      last_name: member.lastName,
      phone_number: member.phoneNumber,
      street_address: member.streetAddress,
      postcode: member.postcode,
      town_city: member.townCity,

      billing_id: member.lastName.toUpperCase(),
      date_of_birth: member.dateOfBirth,
      member_since: now.toISOString(),

      licence_id: member.licenceId,
      licence_expiry_date: member.licenceExpiry,
      medical_expiry_date: member.medicalExpiry,

      lang_iso639: member.lang as any,
      created_at: now,
      created_by: jwt?.memberId ?? new_member_id,
      updated_at: now,
      updated_by: jwt?.memberId ?? new_member_id,
    })
    .returning('member_id')
    .executeTakeFirstOrThrow()

  if (insRetval) {
    return insRetval.member_id
  }

  throw new Error('Member insert failed, no member id returned')
}

export async function updateMemberLang(
  memberId: string,
  lang: MIKLang,
  jwt: JWTUser,
): Promise<boolean> {
  const now = new Date()

  const result = await db
    .updateTable('member.register')
    .set({
      lang_iso639: lang as any,
      updated_at: now,
      updated_by: jwt.memberId,
    })
    .where('member_id', '=', memberId)
    .executeTakeFirstOrThrow()
  if (!result.numUpdatedRows) {
    return false
  }

  return true
}

export async function updateMember(
  memberId: string,
  patch: Partial<Member>,
  jwt: JWTUser,
): Promise<boolean> {
  const now = new Date()

  const result = await db
    .updateTable('member.register')
    .set({
      member_type: patch.memberType,
      email: patch.email?.toLowerCase(),
      first_name: patch.firstName,
      last_name: patch.lastName,

      phone_number: patch.phoneNumber,
      street_address: patch.streetAddress,
      postcode: patch.postcode,
      town_city: patch.townCity,

      ice_contact_name: patch.iceContactName,
      ice_contact_phone_number: patch.iceContactPhoneNumber,

      is_training_program_pilot: patch.isTrainingProgramPilot,
      can_make_reservations: patch.canMakeReservations,
      billing_id: patch.billingId,
      date_of_birth: patch.dateOfBirth,
      member_since: patch.memberSince,

      licence_id: patch.licenceId,
      licence_expiry_date: patch.licenceExpiry,
      medical_expiry_date: patch.medicalExpiry,

      updated_at: now,
      updated_by: jwt.memberId,
      email_verified_at: patch.emailVerifiedAt,
    })
    .where('member_id', '=', memberId)
    .executeTakeFirstOrThrow()
  if (!result.numUpdatedRows) {
    return false
  }

  if (patch.roles) {
    await updateMemberRoles(
      memberId,
      patch.roles.map(role => role.roleId),
      jwt,
    )
  }

  return true
}

export async function removeMember(memberId: string): Promise<boolean> {
  await db
    .deleteFrom('member.member_to_roles')
    .where('member_id', '=', memberId)
    .executeTakeFirstOrThrow()

  const result = await db
    .deleteFrom('member.register')
    .where('member_id', '=', memberId)
    .executeTakeFirstOrThrow()
  return result.numDeletedRows == BigInt(1)
}

export async function getMembersAwaitingApproval(): Promise<Member[] | undefined> {
  const members = await db
    .selectFrom('member.register')
    .selectAll()
    .where('is_membership_approved', '=', false)
    .orderBy('created_at', 'desc')
    .execute()

  return members.map(member => toMember(member, []))
}

export async function setMembershipApproval(
  member_id: string,
  approved_by: string,
): Promise<MemberApproval> {
  await db.transaction().execute(async txn => {
    const member = await txn
      .updateTable('member.register')
      .set({
        membership_approved_at: new Date(),
        membership_approved_by: approved_by,
      })
      .where('member_id', '=', member_id)
      .where('is_membership_approved', '=', false)
      .returningAll()
      .executeTakeFirstOrThrow()

    await txn
      .insertInto('accts.outbox_simplbooks')
      .values({
        id: randomUUID(),
        event_type: SimplbooksEventType.ADD_MEMBER,
        payload: {
          ...member,
          created_at: member.created_at.toISOString(),
          updated_at: member.updated_at.toISOString(),
          email_verified_at: member.email_verified_at?.toISOString(),
          membership_approved_at: member.membership_approved_at?.toISOString(),
        },
      })
      .execute()
  })

  const approval = await db
    .selectFrom('member.register')
    .select([
      'member_id',
      'membership_approved_at',
      'membership_approved_by',
      'email',
      'first_name',
      'lang_iso639',
    ])
    .where('member_id', '=', member_id)
    .executeTakeFirstOrThrow()

  const retval: MemberApproval = {
    memberId: approval.member_id,
    membershipApprovedAt: approval.membership_approved_at!.toISOString(),
    membershipApprovedBy: approval.membership_approved_by!,
    email: approval.email,
    firstName: approval.first_name,
    lang: z.nativeEnum(MIKLang).parse(approval.lang_iso639),
  }
  return retval
}

export async function updateMemberRoles(
  memberId: string,
  roles: string[],
  jwt: JWTUser,
): Promise<void> {
  const now = new Date()

  const existingRoleIds = (await getMemberRolesByMemberId(memberId)).map(role => role.roleId)

  const newRoles = roles.filter(role => !existingRoleIds.includes(role))
  const oldRoles = existingRoleIds.filter(existingRoleId => !roles.includes(existingRoleId))

  if (newRoles.length > 0) {
    await db
      .insertInto('member.member_to_roles')
      .values(
        newRoles.map(newRole => ({
          member_id: memberId,
          role_id: newRole,
          created_by: jwt.memberId,
          created_at: now,
        })),
      )
      .execute()
  }

  if (oldRoles.length > 0) {
    await db
      .deleteFrom('member.member_to_roles')
      .where('member_id', '=', memberId)
      .where('role_id', 'in', oldRoles)
      .execute()
  }
}

//
// Role queries
//

function toMemberRole(role: Selectable<MemberRoles>): MemberRole {
  return {
    roleId: role.role_id,
    description: role.description,
    name: {
      [MIKLang.EN]: role.name_en,
      [MIKLang.FI]: role.name_fi,
      [MIKLang.SV]: (role as any).name_sv,
    },
    isPublic: role.is_public,
    permissions: role.permissions as MIKPermissions[],
    createdAt: role.created_at.toISOString(),
    createdBy: role.created_by,
    updatedAt: role.updated_at.toISOString(),
    updatedBy: role.updated_by,
  }
}

export async function getMemberRolesByMemberId(memberId: string): Promise<MemberRole[]> {
  const roles = await db
    .selectFrom('member.roles')
    .selectAll()
    .innerJoin('member.member_to_roles', 'member.member_to_roles.role_id', 'member.roles.role_id')
    .where('member_id', '=', memberId)
    .orderBy('member.roles.role_id')
    .execute()

  return roles.map(toMemberRole)
}

export async function getAllMemberRoles(isPublic?: boolean): Promise<MemberRole[]> {
  const roles = await db
    .selectFrom('member.roles')
    .selectAll()
    .$if(isPublic !== undefined, qb => qb.where('is_public', '=', isPublic!))
    .orderBy('role_id')
    .execute()
  return roles.map(toMemberRole)
}

export async function getAllMemberRoleById(roleId: string): Promise<MemberRole | undefined> {
  const role = await db
    .selectFrom('member.roles')
    .selectAll()
    .where('role_id', '=', roleId)
    .executeTakeFirst()
  return role ? toMemberRole(role) : undefined
}

export async function addMemberRole(role: Upsert<MemberRole>, jwt: JWTUser): Promise<MemberRole> {
  const now = new Date()

  const result = await db
    .insertInto('member.roles')
    .values({
      role_id: role.roleId,
      description: role.description,
      name_en: role.name[MIKLang.EN],
      name_fi: role.name[MIKLang.FI],
      name_sv: role.name[MIKLang.SV] as any,
      is_public: role.isPublic,
      permissions: JSON.stringify(role.permissions),

      created_at: now,
      created_by: jwt.memberId,
      updated_at: now,
      updated_by: jwt.memberId,
    })
    .executeTakeFirst()
  if (!result.numInsertedOrUpdatedRows) {
    return problem({ status: 500, detail: 'Member insert failed' })
  }
  return {
    ...role,
    createdAt: now.toISOString(),
    createdBy: jwt.memberId,
    updatedAt: now.toISOString(),
    updatedBy: jwt.memberId,
  }
}

export async function updateMemberRole(
  roleId: string,
  patch: Partial<MemberRole>,
  jwt: JWTUser,
): Promise<boolean> {
  const now = new Date()

  const result = await db
    .updateTable('member.roles')
    .set({
      role_id: patch.roleId,
      description: patch.description,
      name_en: patch.name?.[MIKLang.EN],
      name_fi: patch.name?.[MIKLang.FI],
      name_sv: patch.name?.[MIKLang.SV] as any,
      is_public: patch.isPublic,
      permissions: JSON.stringify(patch.permissions),

      updated_at: now,
      updated_by: jwt.memberId,
    })
    .where('role_id', '=', roleId)
    .executeTakeFirstOrThrow()
  return result.numUpdatedRows == BigInt(1)
}

export async function removeMemberRole(roleId: string): Promise<boolean> {
  const result = await db
    .deleteFrom('member.roles')
    .where('role_id', '=', roleId)
    .executeTakeFirstOrThrow()
  return result.numDeletedRows == BigInt(1)
}
