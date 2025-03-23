import type { Selectable } from 'kysely'

import { db } from './connection.ts'
import type { MemberRegister } from './schema.js'
import type { RegisterRequest } from '../routes/auth/schema.ts'
import type { JWTPayload } from '../routes/auth/user.ts'
import { MIKRoles, MIKMemberTypes, type Member, type MemberList } from '../routes/members/models.ts'

export async function getMemberById(memberId: number): Promise<Member | undefined> {
  const member = await db
    .selectFrom('member.register')
    .selectAll()
    .where('member_id', '=', memberId)
    .executeTakeFirst()
  if (member !== undefined) {
    return toMember(member)
  }
}

// Get member using email
export async function getMemberByEmail(email: string): Promise<Member | undefined> {
  const member = await db
    .selectFrom('member.register')
    .selectAll()
    .where('email', '=', email)
    .executeTakeFirst()
  if (member !== undefined) {
    return toMember(member)
  }
}

async function toMember(member: Selectable<MemberRegister>): Promise<Member> {
  const roles = await getMemberRoles(member.member_id)
  return {
    memberId: member.member_id,
    memberType: member.member_type_id as MIKMemberTypes,
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
    dateOfBirth: member.date_of_birth?.toDateString(),
    memberSince: member.member_since.toDateString(),

    createdAt: member.created_at.toUTCString(),
    createdBy: member.created_by,
    updatedAt: member.updated_at.toUTCString(),
    updatedBy: member.updated_by,
    emailVerifiedAt: member.email_verified_at?.toUTCString(),

    roles,
  }
}

export async function getMemberRoles(memberId: number): Promise<MIKRoles[]> {
  const roles = await db
    .selectFrom('member.member_to_roles')
    .select('role_id')
    .where('member_id', '=', memberId)
    .execute()

  return roles.map(role => MIKRoles[role.role_id as keyof typeof MIKRoles])
}

export async function getMembers(): Promise<MemberList[]> {
  const list = await db
    .selectFrom('member.register')
    .select(['member_id', 'email', 'first_name', 'last_name', 'phone_number'])
    .execute()

  return list.map(member => ({
    memberId: member.member_id,
    name: `${member.first_name} ${member.last_name}`,
    phoneNumber: member.phone_number,
  }))
}

export async function addMember(member: RegisterRequest, jwt?: JWTPayload): Promise<number> {
  const now = new Date()
  const userId = jwt?.memberId.toString() ?? 'self'
  const result = await db
    .insertInto('member.register')
    .values({
      member_type_id: member.memberType,
      email: member.email,
      first_name: member.firstName,
      last_name: member.lastName,

      phone_number: member.phoneNumber,
      street_address: member.streetAddress,
      postcode: member.postcode,
      town_city: member.townCity,

      billing_id: member.lastName.toUpperCase(),
      date_of_birth: member.dateOfBirth ? new Date(member.dateOfBirth) : undefined,
      member_since: now,

      created_at: now,
      created_by: userId,
      updated_at: now,
      updated_by: userId,
      email_verified_at: undefined,
    })
    .returning('member_id')
    .executeTakeFirst()
  if (!result?.member_id) {
    throw new Error('Member insert failed')
  }

  return result.member_id
}

export async function updateMember(
  memberId: number,
  patch: Partial<Member>,
  jwt: JWTPayload,
): Promise<void> {
  const now = new Date()

  const result = await db
    .updateTable('member.register')
    .set({
      member_type_id: patch.memberType?.toString(),
      email: patch.email,
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

      updated_at: now,
      updated_by: jwt.memberId.toString(),
      email_verified_at: patch.emailVerifiedAt,
    })
    .where('member_id', '=', memberId)
    .executeTakeFirstOrThrow()
  if (!result.numUpdatedRows) {
    throw new Error('Member update failed')
  }
}
