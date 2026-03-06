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
  type InvoiceMember,
  type Member,
  type MemberList,
  type MemberRole,
  FeeProcessingItemSchema,
  type FeeProcessingItem,
  type MemberListFilters,
} from '../routes/members/models.ts'
import { problem } from '../routes/response.ts'
import type { Upsert } from '../types/schema.ts'
import { generateShortId } from '../util/nanoId.ts'
import { randomUUID } from 'node:crypto'
import { RecurringFeeType, SimplbooksEventType } from '../services/simplbooks/models.ts'
import type { DashboardSettings } from '../routes/dashboard/models.ts'

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

    imWhatsapp: member.im_whatsapp,
    imTelegram: member.im_telegram,
    imFacebookMessenger: member.im_facebook_messenger,
    imDiscord: member.im_discord,
    imViber: member.im_viber,
    imSignal: member.im_signal,

    isTrainingProgramPilot: member.is_training_program_pilot,
    canMakeReservations: member.can_make_reservations,
    billingId: member.billing_id,
    brevoContactId: member.brevo_contact_id ? Number(member.brevo_contact_id) : undefined,
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

    autoRenewAnnualMembership: member.auto_renew_annual_membership,
    autoRenewEquipmentFee: member.auto_renew_equipment_fee,
    isMembershipExpired: member.is_membership_expired,

    lang: member.lang_iso639 as MIKLang,
    mailingLists: (member.mailing_lists as string[] | null) ?? undefined,
    roles: roles,
  }
}

// only public roles are visible to non-admins
const getPublicRolesToQuery = (publicRoles: string[], roles: string[]) => {
  const allowedRoles = roles
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
  roles: string[],
  { name, showUnapproved, showRemoved, showExternal }: Omit<MemberListFilters, 'role'>,
): Promise<MemberList[]> {
  // admin can search any roles
  const publicRoles = (await getAllMemberRoles(true)).map(role => role.roleId)
  const filterRoles = isAdmin ? roles : getPublicRolesToQuery(publicRoles, roles)

  let list = await db
    .selectFrom('member.register')
    .select(eb => [
      'member.register.member_id',
      'first_name',
      'last_name',
      'phone_number',
      'email',
      'lang_iso639',
      jsonArrayFrom(
        eb
          .selectFrom('member.member_to_roles')
          .select('role_id')
          .whereRef('member.member_to_roles.member_id', '=', 'member.register.member_id')
          .orderBy('role_id'),
      ).as('roles'),
    ])

    // see only members waiting for approval
    .$if(isAdmin && showUnapproved === true, qb =>
      qb
        .where('is_membership_approved', '=', false)
        .where('member_type', '!=', MIKMemberTypes.EXTERNAL),
    )
    // or everybody else
    .$if(!isAdmin || !showUnapproved, qb =>
      qb.where(eb =>
        eb.or([
          eb('is_membership_approved', '=', true),
          eb('member_type', '=', MIKMemberTypes.EXTERNAL),
        ]),
      ),
    )

    // show only external members
    .$if(isAdmin && showExternal === true, qb =>
      qb.where('member_type', '=', MIKMemberTypes.EXTERNAL),
    )
    // show only removed members or hide otherwise
    .where('member_type', isAdmin && showRemoved ? '=' : '!=', MIKMemberTypes.REMOVED)

    // system users are always hidden
    .where('member_type', '!=', MIKMemberTypes.SYSTEM)

    // query by name
    .$if(!!name, qb =>
      qb.where(eb => eb('first_name', 'ilike', `${name}%`).or('last_name', 'ilike', `${name}%`)),
    )

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
    lang: member.lang_iso639 as MIKLang,
    roles: member.roles
      .map(role => role.role_id)
      .filter(role => isAdmin || publicRoles.includes(role)),
  }))
}

export async function getMembersForAnnualMembershipFee(year: number): Promise<InvoiceMember[]> {
  const members = await db
    .selectFrom('member.register')
    .select([
      'member.register.member_id',
      'email',
      'first_name',
      'last_name',
      'billing_id',
      'lang_iso639',
      'member_type',
      'auto_renew_annual_membership',
      'auto_renew_equipment_fee',
    ])
    .where('is_membership_approved', '=', true)
    .where('is_membership_expired', '=', false)
    .where('auto_renew_annual_membership', '=', true)
    .where('member_type', 'not in', [
      MIKMemberTypes.HONORARY,
      MIKMemberTypes.EXTERNAL,
      MIKMemberTypes.REMOVED,
      MIKMemberTypes.SYSTEM,
    ])
    .orderBy('last_name')
    .orderBy('first_name')
    .execute()

  return members.map(member => ({
    memberId: member.member_id,
    firstName: member.first_name,
    lastName: member.last_name,
    billingId: member.billing_id ?? undefined,
    memberType: member.member_type as MIKMemberTypes,
    email: member.email,
    lang: member.lang_iso639 as MIKLang,
    autoRenewAnnualMembership: member.auto_renew_annual_membership,
    autoRenewEquipmentFee: member.auto_renew_equipment_fee,
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

      billing_id: undefined,
      date_of_birth: member.dateOfBirth,
      member_since: now.toISOString(),
      auto_renew_annual_membership: member.autoRenewAnnualMembership,
      auto_renew_equipment_fee: member.autoRenewEquipmentFee,

      licence_id: member.licenceId,
      licence_expiry_date: member.licenceExpiry,
      medical_expiry_date: member.medicalExpiry,

      lang_iso639: member.lang,
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
      lang_iso639: lang,
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

      im_whatsapp: patch.imWhatsapp,
      im_telegram: patch.imTelegram,
      im_facebook_messenger: patch.imFacebookMessenger,
      im_discord: patch.imDiscord,
      im_viber: patch.imViber,
      im_signal: patch.imSignal,

      is_training_program_pilot: patch.isTrainingProgramPilot,
      can_make_reservations: patch.canMakeReservations,
      billing_id: patch.billingId,
      date_of_birth: patch.dateOfBirth,
      member_since: patch.memberSince,

      auto_renew_annual_membership: patch.autoRenewAnnualMembership,
      auto_renew_equipment_fee: patch.autoRenewEquipmentFee,
      is_membership_expired: patch.isMembershipExpired,

      mailing_lists:
        patch.mailingLists === undefined ? undefined : JSON.stringify(patch.mailingLists),

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

export async function setMemberExpired(memberId: string): Promise<boolean> {
  await db
    .deleteFrom('member.member_to_roles')
    .where('member_id', '=', memberId)
    .executeTakeFirstOrThrow()

  const result = await db
    .updateTable('member.register')
    .set({
      is_membership_expired: true,
      can_make_reservations: false,
    })
    .where('member_id', '=', memberId)
    .executeTakeFirstOrThrow()
  return result.numUpdatedRows == BigInt(1)
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

export async function setMembershipApproval(
  memberId: string,
  approvedBy: string,
  createSimplbooksAccount: boolean,
): Promise<Member> {
  return await db.transaction().execute(async txn => {
    const member = await txn
      .updateTable('member.register')
      .set({
        can_make_reservations: true,
        membership_approved_at: new Date(),
        membership_approved_by: approvedBy,
      })
      .where('member_id', '=', memberId)
      .returningAll()
      .executeTakeFirstOrThrow()

    if (createSimplbooksAccount) {
      await txn
        .insertInto('accts.outbox_simplbooks')
        .values({
          id: randomUUID(),
          event_type: SimplbooksEventType.ADD_MEMBER,
          payload: toMember(member, []),
        })
        .execute()
    }

    return toMember(member, [])
  })
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

export async function getMemberRolesByPermission(
  permission: MIKPermissions,
): Promise<MemberRole[]> {
  const roles = await db
    .selectFrom('member.roles')
    .selectAll()
    .where(eb => eb('permissions', '@>', JSON.stringify(permission)))
    .orderBy('role_id')
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
export async function getMemberRoleById(roleId: string): Promise<MemberRole | undefined> {
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

export async function getFeeProcessingItemForMember(
  feeType: RecurringFeeType,
  year: number,
  memberId: string,
): Promise<FeeProcessingItem | undefined> {
  const result = await db
    .selectFrom('member.annual_fees')
    .where('fee_type', '=', feeType)
    .where('year', '=', year)
    .where('member_id', '=', memberId)
    .selectAll()
    .executeTakeFirst()

  if (!result) {
    return undefined
  }

  return FeeProcessingItemSchema.parse(result)
}

/**
 * Suspend a member's ability to make reservations
 */
export async function suspendMemberReservations(memberId: string): Promise<void> {
  await db
    .updateTable('member.register')
    .set({
      can_make_reservations: false,
      updated_at: new Date(),
      updated_by: 'k1mnimda',
    })
    .where('member_id', '=', memberId)
    .execute()
}

/**
 * Restore a member's ability to make reservations
 */
export async function restoreMemberReservations(memberId: string): Promise<void> {
  await db
    .updateTable('member.register')
    .set({
      can_make_reservations: true,
      updated_at: new Date(),
      updated_by: 'k1mnimda',
    })
    .where('member_id', '=', memberId)
    .execute()
}

export async function getDashboardSettings(memberId: string): Promise<DashboardSettings | null> {
  const result = await db
    .selectFrom('member.register')
    .select('dashboard_settings')
    .where('member_id', '=', memberId)
    .executeTakeFirstOrThrow()
  if (result.dashboard_settings === null) {
    return null
  }
  return result.dashboard_settings as DashboardSettings
}

export async function setDashboardSettings(
  memberId: string,
  settings: DashboardSettings | null,
): Promise<void> {
  await db
    .updateTable('member.register')
    .set({
      dashboard_settings: settings,
      updated_at: new Date(),
      updated_by: memberId,
    })
    .where('member_id', '=', memberId)
    .execute()
}

/**
 * Check if a member can be safely deleted from the database
 * Returns true if member has no flight activity or invoices
 */
export async function canMemberBeDeleted(memberId: string): Promise<boolean> {
  // Check for flight log entries
  const flightCount = await db
    .selectFrom('flight.logs')
    .select(eb => eb.fn.count('flight_id').as('count'))
    .where(eb =>
      eb.or([
        eb('pic_member_id', '=', memberId),
        eb('crew2_member_id', '=', memberId),
        eb('crew3_member_id', '=', memberId),
        eb('crew4_member_id', '=', memberId),
        eb('billable_member_id', '=', memberId),
      ]),
    )
    .executeTakeFirst()

  if (flightCount && Number(flightCount.count) > 0) {
    return false
  }

  // Check for invoices
  const invoiceCount = await db
    .selectFrom('accts.invoice')
    .select(eb => eb.fn.count('id').as('count'))
    .where('member_id', '=', memberId)
    .executeTakeFirst()

  if (invoiceCount && Number(invoiceCount.count) > 0) {
    return false
  }

  return true
}

/**
 * Deactivate a member by setting their status to REMOVED
 * This removes all permissions, sets status to REMOVED, and records removal info
 */
export async function deactivateMember(
  memberId: string,
  removedBy: string,
  reason?: string,
): Promise<void> {
  await db.transaction().execute(async txn => {
    // Remove all roles/permissions
    await txn.deleteFrom('member.member_to_roles').where('member_id', '=', memberId).execute()

    const now = new Date()

    // Update member status to REMOVED and revoke permissions
    await txn
      .updateTable('member.register')
      .set({
        member_type: MIKMemberTypes.REMOVED,
        can_make_reservations: false,
        is_membership_expired: true,
        removed_at: now,
        removed_by: removedBy,
        removal_reason: reason ?? null,
        updated_at: now,
        updated_by: removedBy,
      })
      .where('member_id', '=', memberId)
      .execute()
  })
}

/**
 * Restore a member from REMOVED status
 * This changes their status back but does not restore roles (must be done separately)
 */
export async function restoreMember(memberId: string, restoredBy: string): Promise<Member> {
  const now = new Date()

  const member = await db
    .updateTable('member.register')
    .set({
      member_type: MIKMemberTypes.FLYING, // Default to FLYING, admin can change later
      removed_at: null,
      removed_by: null,
      removal_reason: null,
      updated_at: now,
      updated_by: restoredBy,
    })
    .where('member_id', '=', memberId)
    .returningAll()
    .executeTakeFirstOrThrow()

  return toMember(member, [])
}

/**
 * Get unpaid membership and equipment fee invoices for a member in a given year
 * Returns invoices that could be eligible for credit notes
 */
export async function getUnpaidMembershipFeesForYear(
  memberId: string,
  year: number,
): Promise<Array<{ id: string; invoice_type: string; pmt_ref: string | null }>> {
  const invoices = await db
    .selectFrom('member.annual_fees')
    .innerJoin('accts.invoice', 'member.annual_fees.invoice_id', 'accts.invoice.id')
    .select(['accts.invoice.id', 'accts.invoice.invoice_type', 'accts.invoice.pmt_ref'])
    .where('member.annual_fees.member_id', '=', memberId)
    .where('member.annual_fees.year', '=', year)
    .where('accts.invoice.is_paid', '=', false)
    .execute()

  return invoices.map(inv => ({
    id: String(inv.id),
    invoice_type: String(inv.invoice_type),
    pmt_ref: inv.pmt_ref,
  }))
}

/**
 * Check if member has any flights in a given year
 */
export async function hasMemberFlownInYear(memberId: string, year: number): Promise<boolean> {
  const yearStart = new Date(year, 0, 1)
  const nextYearStart = new Date(year + 1, 0, 1)
  const yearStartEpoch = Math.floor(yearStart.getTime() / 1000).toString()
  const nextYearStartEpoch = Math.floor(nextYearStart.getTime() / 1000).toString()

  const flightCount = await db
    .selectFrom('flight.logs')
    .select(eb => eb.fn.count('flight_id').as('count'))
    .where(eb =>
      eb.or([
        eb('pic_member_id', '=', memberId),
        eb('crew2_member_id', '=', memberId),
        eb('crew3_member_id', '=', memberId),
        eb('crew4_member_id', '=', memberId),
        eb('billable_member_id', '=', memberId),
      ]),
    )
    .where('takeoff_time_epoch', '>=', yearStartEpoch)
    .where('takeoff_time_epoch', '<', nextYearStartEpoch)
    .executeTakeFirst()

  return flightCount ? Number(flightCount.count) > 0 : false
}
