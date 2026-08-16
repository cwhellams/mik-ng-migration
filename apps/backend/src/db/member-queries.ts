import { sql } from 'kysely'
import { jsonArrayFrom } from 'kysely/helpers/postgres'

import { camelCaseNestedRows, db, type DbRow } from './connection.ts'
import type { RegisterRequest } from '@mik/contracts/auth'
import type { JWTUser } from '../routes/auth/token.ts'
import {
  MIKLang,
  MIKMemberTypes,
  ApplicationDataSchema,
  MIKPermissions,
  type InvoiceMember,
  type Member,
  type MemberList,
  type MemberRole,
  type MemberDeletability,
  FeeProcessingItemSchema,
  type FeeProcessingItem,
  type MemberListFilters,
  type NonRenewalMember,
  type NonRenewalAction,
  NonRenewalActionType,
  MemberChangeType,
  type MemberChangeLogEntry,
  type MemberChangeLogFilters,
} from '@mik/contracts/members'
import { problem } from '../routes/response.ts'
import type { Upsert } from '@mik/contracts/schema'
import { generateShortId } from '../util/nanoId.ts'
import { randomUUID } from 'node:crypto'
import { RecurringFeeType, SimplbooksEventType } from '../services/simplbooks/models.ts'
import type { DashboardSettings } from '@mik/contracts/dashboard'

export async function getMemberById(memberId: string): Promise<Member | undefined> {
  const member = await db
    .selectFrom('member.register')
    .selectAll()
    .where('memberId', '=', memberId)
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
    return toMember(member, await getMemberRolesByMemberId(member.memberId))
  }
}

function toMember(member: DbRow<'member.register'>, roles: MemberRole[]): Member {
  return {
    memberId: member.memberId,
    memberType: member.memberType as MIKMemberTypes,
    email: member.email,
    firstName: member.firstName,
    lastName: member.lastName,

    phoneNumber: member.phoneNumber,
    phoneCountry: member.phoneCountry,
    postcode: member.postcode,
    streetAddress: member.streetAddress,
    townCity: member.townCity,
    country: member.country,

    iceContactName: member.iceContactName,
    iceContactPhoneNumber: member.iceContactPhoneNumber,
    iceContactPhoneCountry: member.iceContactPhoneCountry,

    imWhatsapp: member.imWhatsapp,
    imTelegram: member.imTelegram,
    imFacebookMessenger: member.imFacebookMessenger,
    imDiscord: member.imDiscord,
    imViber: member.imViber,
    imSignal: member.imSignal,

    isTrainingProgramPilot: member.isTrainingProgramPilot,
    canMakeReservations: member.canMakeReservations,
    billingId: member.billingId,
    brevoContactId: member.brevoContactId ? Number(member.brevoContactId) : undefined,
    dateOfBirth: member.dateOfBirth,
    memberSince: member.memberSince,

    createdAt: member.createdAt.toISOString(),
    createdBy: member.createdBy,
    updatedAt: member.updatedAt.toISOString(),
    updatedBy: member.updatedBy,
    emailVerifiedAt: member.emailVerifiedAt?.toISOString(),

    licenceId: member.licenceId ?? undefined,
    licenceExpiry: member.licenceExpiryDate,
    medicalExpiry: member.medicalExpiryDate,
    medicalClass1Expiry: member.medicalClass1ExpiryDate,
    medicalClass2Expiry: member.medicalClass2ExpiryDate,
    medicalLaplExpiry: member.medicalLaplExpiryDate,

    iban: member.iban,
    ibanAccountName: member.ibanAccountName,

    isMembershipApproved: member.isMembershipApproved,
    membershipApprovedAt: member.membershipApprovedAt?.toISOString(),
    membershipApprovedBy: member.membershipApprovedBy ?? undefined,
    defaultInstructorMemberId: member.defaultInstructorMemberId ?? undefined,

    autoRenewAnnualMembership: member.autoRenewAnnualMembership,
    autoRenewEquipmentFee: member.autoRenewEquipmentFee,
    isMembershipExpired: member.isMembershipExpired,
    mustUpdateProfile: member.mustUpdateProfile,

    lang: member.langIso639 as MIKLang,
    mailingLists: (member.mailingLists as string[] | null) ?? undefined,
    applicationData: (() => {
      if (!member.applicationData) return undefined
      const result = ApplicationDataSchema.safeParse(member.applicationData)
      return result.success ? result.data : undefined
    })(),
    roles: roles,
  }
}

// only public roles are visible to non-admins
const getPublicRolesToQuery = (publicRoles: string[], roles: string[]) => {
  const allowedRoles = roles
    // drop other than public roles
    .filter((role) => publicRoles.includes(role))

  if (allowedRoles.length > 0) {
    return allowedRoles
  }

  // if no valid roles are found, show all public roles
  return publicRoles
}

// Serialize a nullable JSON field for DB update: undefined leaves the column untouched,
// null clears it, any other value is serialized to a JSON string.
const serializeJsonField = (value: unknown | null | undefined): string | null | undefined => {
  if (value === undefined) return undefined
  if (value === null) return null
  return JSON.stringify(value)
}

export async function getMembers(
  isAdmin: boolean,
  roles: string[],
  { name, memberType, showUnapproved, showRemoved, showExternal }: Omit<MemberListFilters, 'role'>,
): Promise<MemberList[]> {
  // admin can search any roles
  const publicRoles = (await getAllMemberRoles(true)).map((role) => role.roleId)
  const filterRoles = isAdmin ? roles : getPublicRolesToQuery(publicRoles, roles)

  let list = await db
    .selectFrom('member.register')
    .select((eb) => [
      'member.register.memberId',
      'firstName',
      'lastName',
      'phoneNumber',
      'townCity',
      'email',
      'langIso639',
      'memberSince',
      'isTrainingProgramPilot',
      'canMakeReservations',
      'billingId',
      'autoRenewAnnualMembership',
      'autoRenewEquipmentFee',
      'mustUpdateProfile',
      jsonArrayFrom(
        eb
          .selectFrom('member.memberToRoles')
          .select('roleId')
          .whereRef('member.memberToRoles.memberId', '=', 'member.register.memberId')
          .orderBy('roleId'),
      ).as('roles'),
    ])

    // see only members waiting for approval
    .$if(isAdmin && showUnapproved === true, (qb) =>
      qb
        .where('isMembershipApproved', '=', false)
        .where('memberType', '!=', MIKMemberTypes.EXTERNAL),
    )
    // or everybody else
    .$if(!isAdmin || !showUnapproved, (qb) =>
      qb.where((eb) =>
        eb.or([
          eb('isMembershipApproved', '=', true),
          eb('memberType', '=', MIKMemberTypes.EXTERNAL),
        ]),
      ),
    )

    // show only external members
    .$if(isAdmin && showExternal === true, (qb) =>
      qb.where('memberType', '=', MIKMemberTypes.EXTERNAL),
    )
    // show only removed members or hide otherwise
    .where('memberType', isAdmin && showRemoved ? '=' : '!=', MIKMemberTypes.REMOVED)

    // system users are always hidden
    .where('memberType', '!=', MIKMemberTypes.SYSTEM)

    // query by name
    .$if(!!name, (qb) =>
      qb.where((eb) => eb('firstName', 'ilike', `${name}%`).or('lastName', 'ilike', `${name}%`)),
    )

    // query users with roles
    .$if(filterRoles.length > 0, (qb) =>
      qb.where((eb) =>
        eb.or(
          filterRoles.map((role) =>
            eb.exists(
              eb
                .selectFrom('member.memberToRoles')
                .whereRef('member.register.memberId', '=', 'member.memberToRoles.memberId')
                .where('roleId', '=', role),
            ),
          ),
        ),
      ),
    )

    // query by member type
    .$if(memberType != null, (qb) => {
      const types = Array.isArray(memberType) ? memberType! : [memberType!]
      return qb.where('memberType', 'in', types)
    })
    .orderBy('lastName')
    .orderBy('firstName')
    .execute()

  return list.map((member) => ({
    memberId: member.memberId,
    first: member.firstName,
    last: member.lastName,
    phoneNumber: member.phoneNumber,
    townCity: member.townCity,
    email: member.email,
    lang: member.langIso639 as MIKLang,
    // nested subquery: the keys inside come back snake_case, so role.roleId would
    // be undefined and every member would lose their roles
    roles: camelCaseNestedRows(member.roles)
      .map((role) => role.roleId)
      .filter((role) => isAdmin || publicRoles.includes(role)),
    ...(isAdmin
      ? {
          memberSince: member.memberSince,
          isTrainingProgramPilot: member.isTrainingProgramPilot,
          canMakeReservations: member.canMakeReservations,
          automaticBillingStatus: member.billingId !== null,
          autoRenewAnnualMembership: member.autoRenewAnnualMembership ?? true,
          autoRenewEquipmentFee: member.autoRenewEquipmentFee ?? false,
          mustUpdateProfile: member.mustUpdateProfile,
        }
      : {}),
  }))
}

export async function getMembersForAnnualMembershipFee(year: number): Promise<InvoiceMember[]> {
  const members = await db
    .selectFrom('member.register')
    .select([
      'member.register.memberId',
      'email',
      'firstName',
      'lastName',
      'billingId',
      'langIso639',
      'memberType',
      'autoRenewAnnualMembership',
      'autoRenewEquipmentFee',
    ])
    .where('isMembershipApproved', '=', true)
    .where('isMembershipExpired', '=', false)
    .where('autoRenewAnnualMembership', '=', true)
    .where('memberType', 'not in', [
      MIKMemberTypes.HONORARY,
      MIKMemberTypes.EXTERNAL,
      MIKMemberTypes.REMOVED,
      MIKMemberTypes.SYSTEM,
    ])
    .orderBy('lastName')
    .orderBy('firstName')
    .execute()

  return members.map((member) => ({
    memberId: member.memberId,
    firstName: member.firstName,
    lastName: member.lastName,
    billingId: member.billingId ?? undefined,
    memberType: member.memberType as MIKMemberTypes,
    email: member.email,
    lang: member.langIso639 as MIKLang,
    autoRenewAnnualMembership: member.autoRenewAnnualMembership,
    autoRenewEquipmentFee: member.autoRenewEquipmentFee,
  }))
}

export async function addMember(member: RegisterRequest, jwt?: JWTUser): Promise<string> {
  const now = new Date()
  const new_member_id = generateShortId()

  const insRetval = await db
    .insertInto('member.register')
    .values({
      memberId: new_member_id,
      memberType: member.memberType,
      email: member.email.toLowerCase(),
      firstName: member.firstName,
      lastName: member.lastName,
      phoneNumber: member.phoneNumber,
      phoneCountry: member.phoneCountry ?? undefined,
      streetAddress: member.streetAddress,
      postcode: member.postcode,
      townCity: member.townCity,
      country: member.country,

      billingId: undefined,
      dateOfBirth: member.dateOfBirth,
      memberSince: now.toISOString(),
      autoRenewAnnualMembership: member.autoRenewAnnualMembership,
      autoRenewEquipmentFee: member.autoRenewEquipmentFee,

      licenceId: member.licenceId,
      licenceExpiryDate: member.licenceExpiry,
      medicalExpiryDate: member.medicalExpiry,
      medicalClass1ExpiryDate: member.medicalClass1Expiry,
      medicalClass2ExpiryDate: member.medicalClass2Expiry,
      medicalLaplExpiryDate: member.medicalLaplExpiry,

      langIso639: member.lang,
      applicationData: member.applicationData ? JSON.stringify(member.applicationData) : undefined,
      createdAt: now,
      createdBy: jwt?.memberId ?? new_member_id,
      updatedAt: now,
      updatedBy: jwt?.memberId ?? new_member_id,
    })
    .returning('memberId')
    .executeTakeFirstOrThrow()

  if (insRetval) {
    return insRetval.memberId
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
      langIso639: lang,
      updatedAt: now,
      updatedBy: jwt.memberId,
    })
    .where('memberId', '=', memberId)
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
      memberType: patch.memberType,
      email: patch.email?.toLowerCase(),
      firstName: patch.firstName,
      lastName: patch.lastName,

      phoneNumber: patch.phoneNumber,
      phoneCountry: patch.phoneCountry ?? undefined,
      streetAddress: patch.streetAddress,
      postcode: patch.postcode,
      townCity: patch.townCity,
      country: patch.country,

      iceContactName: patch.iceContactName,
      iceContactPhoneNumber: patch.iceContactPhoneNumber,
      iceContactPhoneCountry: patch.iceContactPhoneCountry ?? undefined,

      imWhatsapp: patch.imWhatsapp,
      imTelegram: patch.imTelegram,
      imFacebookMessenger: patch.imFacebookMessenger,
      imDiscord: patch.imDiscord,
      imViber: patch.imViber,
      imSignal: patch.imSignal,

      isTrainingProgramPilot: patch.isTrainingProgramPilot,
      canMakeReservations: patch.canMakeReservations,
      billingId: patch.billingId,
      dateOfBirth: patch.dateOfBirth,
      memberSince: patch.memberSince,

      autoRenewAnnualMembership: patch.autoRenewAnnualMembership,
      autoRenewEquipmentFee: patch.autoRenewEquipmentFee,
      isMembershipExpired: patch.isMembershipExpired,

      mailingLists:
        patch.mailingLists === undefined ? undefined : JSON.stringify(patch.mailingLists),

      applicationData: serializeJsonField(patch.applicationData),

      licenceId: patch.licenceId,
      licenceExpiryDate: patch.licenceExpiry,
      medicalExpiryDate: patch.medicalExpiry,
      medicalClass1ExpiryDate: patch.medicalClass1Expiry,
      medicalClass2ExpiryDate: patch.medicalClass2Expiry,
      medicalLaplExpiryDate: patch.medicalLaplExpiry,

      iban: patch.iban,
      ibanAccountName: patch.ibanAccountName,

      defaultInstructorMemberId: patch.defaultInstructorMemberId,

      updatedAt: now,
      updatedBy: jwt.memberId,
      emailVerifiedAt: patch.emailVerifiedAt,
    })
    .where('memberId', '=', memberId)
    .executeTakeFirstOrThrow()
  if (!result.numUpdatedRows) {
    return false
  }

  if (patch.roles) {
    await updateMemberRoles(
      memberId,
      patch.roles.map((role) => role.roleId),
      jwt,
    )
  }

  return true
}

export async function setMustUpdateProfileBulk(
  memberIds: string[],
  value: boolean,
  jwt: JWTUser,
): Promise<number> {
  if (memberIds.length === 0) return 0
  const result = await db
    .updateTable('member.register')
    .set({ mustUpdateProfile: value, updatedAt: new Date(), updatedBy: jwt.memberId })
    .where('memberId', 'in', memberIds)
    .executeTakeFirst()
  return Number(result.numUpdatedRows)
}

export async function clearMustUpdateProfile(memberId: string, jwt: JWTUser): Promise<void> {
  await db
    .updateTable('member.register')
    .set({ mustUpdateProfile: false, updatedAt: new Date(), updatedBy: jwt.memberId })
    .where('memberId', '=', memberId)
    .where('mustUpdateProfile', '=', true)
    .execute()
}

export async function removeMember(memberId: string): Promise<boolean> {
  await db
    .deleteFrom('member.memberToRoles')
    .where('memberId', '=', memberId)
    .executeTakeFirstOrThrow()

  const result = await db
    .deleteFrom('member.register')
    .where('memberId', '=', memberId)
    .where('brevoContactId', 'is', null) // only delete if member is not sync'd to Brevo
    .executeTakeFirstOrThrow()
  return result.numDeletedRows == BigInt(1)
}

export async function setMembershipApproval(
  memberId: string,
  approvedBy: string,
  createSimplbooksAccount: boolean,
): Promise<Member> {
  return await db.transaction().execute(async (txn) => {
    const member = await txn
      .updateTable('member.register')
      .set({
        canMakeReservations: true,
        membershipApprovedAt: new Date(),
        membershipApprovedBy: approvedBy,
      })
      .where('memberId', '=', memberId)
      .returningAll()
      .executeTakeFirstOrThrow()

    if (createSimplbooksAccount) {
      await txn
        .insertInto('accts.outboxSimplbooks')
        .values({
          id: randomUUID(),
          eventType: SimplbooksEventType.ADD_MEMBER,
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

  const existingRoleIds = (await getMemberRolesByMemberId(memberId)).map((role) => role.roleId)

  const newRoles = roles.filter((role) => !existingRoleIds.includes(role))
  const oldRoles = existingRoleIds.filter((existingRoleId) => !roles.includes(existingRoleId))

  if (newRoles.length > 0) {
    await db
      .insertInto('member.memberToRoles')
      .values(
        newRoles.map((newRole) => ({
          memberId: memberId,
          roleId: newRole,
          createdBy: jwt.memberId,
          createdAt: now,
        })),
      )
      .execute()
  }

  if (oldRoles.length > 0) {
    await db
      .deleteFrom('member.memberToRoles')
      .where('memberId', '=', memberId)
      .where('roleId', 'in', oldRoles)
      .execute()
  }
}

//
// Role queries
//

function toMemberRole(role: DbRow<'member.roles'>): MemberRole {
  return {
    roleId: role.roleId,
    description: role.description,
    name: {
      [MIKLang.EN]: role.nameEn,
      [MIKLang.FI]: role.nameFi,
      [MIKLang.SV]: role.nameSv,
    },
    isPublic: role.isPublic,
    permissions: role.permissions as MIKPermissions[],
    createdAt: role.createdAt.toISOString(),
    createdBy: role.createdBy,
    updatedAt: role.updatedAt.toISOString(),
    updatedBy: role.updatedBy,
  }
}

export async function getMemberRolesByMemberId(memberId: string): Promise<MemberRole[]> {
  const roles = await db
    .selectFrom('member.roles')
    .selectAll()
    .innerJoin('member.memberToRoles', 'member.memberToRoles.roleId', 'member.roles.roleId')
    .where('memberId', '=', memberId)
    .orderBy('member.roles.roleId')
    .execute()

  return roles.map(toMemberRole)
}

export async function getMemberRolesByPermission(
  permission: MIKPermissions,
): Promise<MemberRole[]> {
  const roles = await db
    .selectFrom('member.roles')
    .selectAll()
    .where((eb) => eb('permissions', '@>', JSON.stringify(permission)))
    .orderBy('roleId')
    .execute()
  return roles.map(toMemberRole)
}

export async function getAllMemberRoles(isPublic?: boolean): Promise<MemberRole[]> {
  const roles = await db
    .selectFrom('member.roles')
    .selectAll()
    .$if(isPublic !== undefined, (qb) => qb.where('isPublic', '=', isPublic!))
    .orderBy('roleId')
    .execute()
  return roles.map(toMemberRole)
}
export async function getMemberRoleById(roleId: string): Promise<MemberRole | undefined> {
  const role = await db
    .selectFrom('member.roles')
    .selectAll()
    .where('roleId', '=', roleId)
    .executeTakeFirst()
  return role ? toMemberRole(role) : undefined
}

export async function addMemberRole(role: Upsert<MemberRole>, jwt: JWTUser): Promise<MemberRole> {
  const now = new Date()

  const result = await db
    .insertInto('member.roles')
    .values({
      roleId: role.roleId,
      description: role.description,
      nameEn: role.name[MIKLang.EN],
      nameFi: role.name[MIKLang.FI],
      nameSv: role.name[MIKLang.SV],
      isPublic: role.isPublic,
      permissions: JSON.stringify(role.permissions),

      createdAt: now,
      createdBy: jwt.memberId,
      updatedAt: now,
      updatedBy: jwt.memberId,
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
      roleId: patch.roleId,
      description: patch.description,
      nameEn: patch.name?.[MIKLang.EN],
      nameFi: patch.name?.[MIKLang.FI],
      nameSv: patch.name?.[MIKLang.SV],
      isPublic: patch.isPublic,
      permissions: JSON.stringify(patch.permissions),

      updatedAt: now,
      updatedBy: jwt.memberId,
    })
    .where('roleId', '=', roleId)
    .executeTakeFirstOrThrow()
  return result.numUpdatedRows == BigInt(1)
}

export async function removeMemberRole(roleId: string): Promise<boolean> {
  const result = await db
    .deleteFrom('member.roles')
    .where('roleId', '=', roleId)
    .executeTakeFirstOrThrow()
  return result.numDeletedRows == BigInt(1)
}

export async function getFeeProcessingItemForMember(
  feeType: RecurringFeeType,
  year: number,
  memberId: string,
): Promise<FeeProcessingItem | undefined> {
  const result = await db
    .selectFrom('member.annualFees')
    .where('feeType', '=', feeType)
    .where('year', '=', year)
    .where('memberId', '=', memberId)
    .selectAll()
    .executeTakeFirst()

  if (!result) {
    return undefined
  }

  // FeeProcessingItemSchema is the wire contract (@mik/contracts/members) and declares
  // snake_case fields, so the camelCase row has to be mapped back before it validates.
  return FeeProcessingItemSchema.parse({
    member_id: result.memberId,
    fee_type: result.feeType,
    year: result.year,
    created_at: result.createdAt,
    created_by: result.createdBy,
  })
}

/**
 * Suspend a member's ability to make reservations
 */
export async function suspendMemberReservations(memberId: string): Promise<void> {
  await db
    .updateTable('member.register')
    .set({
      canMakeReservations: false,
      updatedAt: new Date(),
      updatedBy: 'k1mnimda',
    })
    .where('memberId', '=', memberId)
    .execute()
}

/**
 * Restore a member's ability to make reservations
 */
export async function restoreMemberReservations(memberId: string): Promise<void> {
  await db
    .updateTable('member.register')
    .set({
      canMakeReservations: true,
      updatedAt: new Date(),
      updatedBy: 'k1mnimda',
    })
    .where('memberId', '=', memberId)
    .execute()
}

export async function getDashboardSettings(memberId: string): Promise<DashboardSettings | null> {
  const result = await db
    .selectFrom('member.register')
    .select('dashboardSettings')
    .where('memberId', '=', memberId)
    .executeTakeFirstOrThrow()
  if (result.dashboardSettings === null) {
    return null
  }
  return result.dashboardSettings as DashboardSettings
}

export async function setDashboardSettings(
  memberId: string,
  settings: DashboardSettings | null,
): Promise<void> {
  await db
    .updateTable('member.register')
    .set({
      dashboardSettings: settings,
      updatedAt: new Date(),
      updatedBy: memberId,
    })
    .where('memberId', '=', memberId)
    .execute()
}

/**
 * Check if a member can be safely deleted from the database.
 * Returns a breakdown of which dependent records exist.
 */
export async function canMemberBeDeleted(memberId: string): Promise<MemberDeletability> {
  const result = await db
    .selectFrom('member.register')
    .select((eb) => [
      eb
        .exists(eb.selectFrom('accts.invoice').select('id').where('memberId', '=', memberId))
        .as('hasInvoices'),
      eb
        .exists(
          eb
            .selectFrom('flight.logs')
            .select('flightId')
            .where((eb2) =>
              eb2.or([
                eb2('picMemberId', '=', memberId),
                eb2('crew2MemberId', '=', memberId),
                eb2('crew3MemberId', '=', memberId),
                eb2('crew4MemberId', '=', memberId),
                eb2('billableMemberId', '=', memberId),
              ]),
            ),
        )
        .as('hasFlights'),
      eb
        .exists(
          eb.selectFrom('schedule.bookings').select('bookingId').where('memberId', '=', memberId),
        )
        .as('hasBookings'),
      'brevoContactId',
    ])
    .where('member.register.memberId', '=', memberId)
    .executeTakeFirstOrThrow()

  const hasInvoices = Boolean(result.hasInvoices)
  const hasFlights = Boolean(result.hasFlights)
  const hasBookings = Boolean(result.hasBookings)
  const hasBrevoId = result.brevoContactId !== null

  return {
    canDelete: !hasInvoices && !hasFlights && !hasBookings && !hasBrevoId,
    hasInvoices,
    hasFlights,
    hasBookings,
    hasBrevoId,
  }
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
  await db.transaction().execute(async (txn) => {
    // Remove all roles/permissions
    await txn.deleteFrom('member.memberToRoles').where('memberId', '=', memberId).execute()

    // Push subscriptions are useless once the member can't log in; delete them
    // explicitly rather than relying on ON DELETE CASCADE, since the member
    // row itself is never hard-deleted here.
    await txn.deleteFrom('member.pushSubscriptions').where('memberId', '=', memberId).execute()

    const now = new Date()

    // Update member status to REMOVED and revoke permissions
    await txn
      .updateTable('member.register')
      .set({
        memberType: MIKMemberTypes.REMOVED,
        canMakeReservations: false,
        isMembershipExpired: true,
        autoRenewAnnualMembership: false,
        autoRenewEquipmentFee: false,
        brevoContactId: null, // remove Brevo contact link
        brevoSyncStatus: null,
        brevoSyncedAt: null,
        removedAt: now,
        removedBy: removedBy,
        removalReason: reason ?? null,
        updatedAt: now,
        updatedBy: removedBy,
      })
      .where('memberId', '=', memberId)
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
      memberType: MIKMemberTypes.FLYING, // Default to FLYING, admin can change later
      removedAt: null,
      removedBy: null,
      removalReason: null,
      updatedAt: now,
      updatedBy: restoredBy,
    })
    .where('memberId', '=', memberId)
    .returningAll()
    .executeTakeFirstOrThrow()

  return toMember(member, [])
}

/**
 * Get unpaid annual membership fee invoices for a member in a given year.
 * Equipment fees are intentionally excluded. Joining fee invoices are included
 * because they are recorded in member.annual_fees as annual_fee when created.
 * Returns invoices that could be eligible for credit notes
 */
export async function getUnpaidMembershipFeesForYear(
  memberId: string,
  year: number,
): Promise<Array<{ id: string; invoice_type: string; pmt_ref: string | null }>> {
  const invoices = await db
    .selectFrom('member.annualFees')
    .innerJoin('accts.invoice', 'member.annualFees.invoiceId', 'accts.invoice.id')
    .select(['accts.invoice.id', 'accts.invoice.invoiceType', 'accts.invoice.pmtRef'])
    .where('member.annualFees.memberId', '=', memberId)
    .where('member.annualFees.year', '=', year)
    .where('member.annualFees.feeType', '=', 'annual_fee')
    .where('accts.invoice.isPaid', '=', false)
    .execute()

  return invoices.map((inv) => ({
    id: String(inv.id),
    // snake on the left: the payment worker and simplBooksEmailer read
    // invoice.pmt_ref, so this shape is this function's contract with them
    invoice_type: String(inv.invoiceType),
    pmt_ref: inv.pmtRef,
  }))
}

/**
 * Get all active JUNIOR members whose 18th birthday is today.
 * Used by the junior member promotion worker.
 */
export async function getJuniorMembersTurning18Today(): Promise<
  Array<{ memberId: string; firstName: string; email: string; lang: MIKLang }>
> {
  const today = new Date()
  const birthYear = today.getFullYear() - 18
  const birthMonth = String(today.getMonth() + 1).padStart(2, '0')
  const birthDay = String(today.getDate()).padStart(2, '0')
  const targetDob = `${birthYear}-${birthMonth}-${birthDay}`

  const members = await db
    .selectFrom('member.register')
    .select(['memberId', 'firstName', 'email', 'langIso639'])
    .where('memberType', '=', MIKMemberTypes.JUNIOR)
    .where('isMembershipApproved', '=', true)
    .where('isMembershipExpired', '=', false)
    .where('dateOfBirth', '=', targetDob)
    .execute()

  return members.map((m) => ({
    memberId: m.memberId,
    firstName: m.firstName,
    email: m.email,
    lang: m.langIso639 as MIKLang,
  }))
}

/**
 * Promote a JUNIOR member to FLYING member type.
 * Used by the junior member promotion worker when a member turns 18.
 */
export async function promoteMemberToFlying(memberId: string): Promise<void> {
  const now = new Date()

  await db
    .updateTable('member.register')
    .set({
      memberType: MIKMemberTypes.FLYING,
      updatedAt: now,
      updatedBy: 'k1mnimda',
    })
    .where('memberId', '=', memberId)
    .execute()
}

/**
 * Check if member has any billable flights in a given year
 */
export async function hasMemberFlownBillableFlightInYear(
  memberId: string,
  year: number,
): Promise<boolean> {
  const yearStart = new Date(year, 0, 1)
  const nextYearStart = new Date(year + 1, 0, 1)
  const yearStartEpoch = Math.floor(yearStart.getTime() / 1000).toString()
  const nextYearStartEpoch = Math.floor(nextYearStart.getTime() / 1000).toString()

  const flightCount = await db
    .selectFrom('flight.logs')
    .select((eb) => eb.fn.count('flightId').as('count'))
    .where('billableMemberId', '=', memberId)
    .where('takeoffTimeEpoch', '>=', yearStartEpoch)
    .where('takeoffTimeEpoch', '<', nextYearStartEpoch)
    .executeTakeFirst()

  return flightCount ? Number(flightCount.count) > 0 : false
}

/**
 * Return all active members who have NOT paid their annual fee for the given year.
 * This includes members with no fee record at all, and members whose fee invoice exists
 * but has not been paid.
 */
export async function getMembersWithNoOrUnpaidAnnualFee(year: number): Promise<NonRenewalMember[]> {
  const results = await db
    .selectFrom('member.register as r')
    .leftJoin(
      (eb) =>
        eb
          .selectFrom('member.annualFees')
          .select(['memberId', 'invoiceId'])
          .where('feeType', '=', 'annual_fee')
          .where('year', '=', year)
          .as('af'),
      (join) => join.onRef('af.memberId', '=', 'r.memberId'),
    )
    .leftJoin('accts.invoice as inv', 'inv.id', 'af.invoiceId')
    .leftJoin(
      (eb) =>
        eb
          .selectFrom('member.nonRenewalActions')
          .select((eb2) => ['memberId', eb2.fn.max('performedAt').as('lastReminderAt')])
          .where('actionType', '=', 'REMINDER_SENT')
          .groupBy('memberId')
          .as('lr'),
      (join) => join.onRef('lr.memberId', '=', 'r.memberId'),
    )
    .leftJoin(
      (eb) => {
        const yearStart = new Date(year, 0, 1)
        const nextYearStart = new Date(year + 1, 0, 1)
        const yearStartEpoch = Math.floor(yearStart.getTime() / 1000).toString()
        const nextYearStartEpoch = Math.floor(nextYearStart.getTime() / 1000).toString()
        return eb
          .selectFrom('flight.logs')
          .select((eb2) => ['billableMemberId', eb2.fn.count('flightId').as('flightCount')])
          .where('takeoffTimeEpoch', '>=', yearStartEpoch)
          .where('takeoffTimeEpoch', '<', nextYearStartEpoch)
          .groupBy('billableMemberId')
          .as('fc')
      },
      (join) => join.onRef('fc.billableMemberId', '=', 'r.memberId'),
    )
    .select((eb) => [
      'r.memberId',
      'r.firstName',
      'r.lastName',
      'r.email',
      'r.phoneNumber',
      'r.memberType',
      'r.langIso639',
      'r.autoRenewAnnualMembership',
      'af.memberId as feeMemberId',
      'inv.isPaid as invoiceIsPaid',
      'inv.sentAt as invoiceSentAt',
      'inv.dueAt as invoiceDueAt',
      'lr.lastReminderAt',
      eb.fn.coalesce('fc.flightCount', eb.val(0)).as('billableFlightCount'),
    ])
    .where('r.memberType', '!=', MIKMemberTypes.REMOVED)
    .where('r.memberType', '!=', MIKMemberTypes.SYSTEM)
    .where('r.memberType', '!=', MIKMemberTypes.EXTERNAL)
    .where('r.memberType', '!=', MIKMemberTypes.HONORARY)
    .where('r.isMembershipApproved', '=', true)
    .where((eb) => eb.or([eb('af.memberId', 'is', null), eb('inv.isPaid', '=', false)]))
    .orderBy('r.lastName')
    .orderBy('r.firstName')
    .execute()

  return results.map((r) => ({
    memberId: r.memberId,
    firstName: r.firstName,
    lastName: r.lastName,
    email: r.email,
    phoneNumber: r.phoneNumber ?? null,
    memberType: r.memberType as MIKMemberTypes,
    lang: r.langIso639 as MIKLang,
    autoRenewAnnualMembership: r.autoRenewAnnualMembership,
    feeStatus: r.feeMemberId === null ? 'no_record' : 'unpaid',
    invoiceSentAt: r.invoiceSentAt ?? null,
    invoiceDueAt: r.invoiceDueAt ?? null,
    lastReminderSentAt: r.lastReminderAt ? r.lastReminderAt.toISOString() : null,
    billableFlightCount: Number(r.billableFlightCount),
  }))
}

/**
 * Record an action taken on a non-renewing member (e.g. reminder email sent).
 */
export async function insertNonRenewalAction(
  memberId: string,
  actionType: NonRenewalActionType,
  performedBy: string,
  notes?: string,
): Promise<NonRenewalAction> {
  const result = await db
    .insertInto('member.nonRenewalActions')
    .values({
      memberId: memberId,
      actionType: actionType,
      performedBy: performedBy,
      notes: notes ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  return {
    id: result.id,
    memberId: result.memberId,
    actionType: result.actionType as NonRenewalActionType,
    performedAt: result.performedAt.toISOString(),
    performedBy: result.performedBy,
    notes: result.notes,
  }
}

/**
 * Columns that are written by background sync jobs or are pure row metadata.
 * They are never interesting in a registry change log, and an audit row whose
 * only changes are these columns is dropped entirely so worker churn does not
 * bury the real membership changes.
 */
// These are compared against the keys of a JSONB audit snapshot (to_jsonb(OLD)), not
// against query results — so they stay snake_case. maintainNestedObjectKeys leaves the
// keys inside JSONB alone, and camelCasing this set silently stopped every sync-only
// update from being filtered out of the changelog.
const CHANGE_LOG_IGNORED_COLUMNS = new Set([
  'created_at',
  'created_by',
  'updated_at',
  'updated_by',
  'brevo_contact_id',
  'brevo_sync_status',
  'brevo_synced_at',
  'simplbooks_sync_status',
  'simplbooks_synced_at',
  'dashboard_settings',
])

type AuditSnapshot = Record<string, unknown> | null

/** Names of the register columns that differ between two audit snapshots. */
function changedColumns(before: AuditSnapshot, after: AuditSnapshot): string[] {
  if (!before || !after) return []

  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((column) => !CHANGE_LOG_IGNORED_COLUMNS.has(column))
    .filter((column) => JSON.stringify(before[column]) !== JSON.stringify(after[column]))
    .sort()
}

function classifyChange(
  operationType: string,
  before: AuditSnapshot,
  after: AuditSnapshot,
): MemberChangeType {
  // A row inserted as already approved (admin adding a member directly) is a
  // join, not a pending application
  if (operationType === 'INSERT') {
    return after?.is_membership_approved === true
      ? MemberChangeType.APPROVED
      : MemberChangeType.REGISTERED
  }
  if (operationType === 'DELETE') return MemberChangeType.DELETED

  const previousType = before?.member_type
  const newType = after?.member_type

  if (newType === MIKMemberTypes.REMOVED && previousType !== MIKMemberTypes.REMOVED) {
    return MemberChangeType.LEFT
  }
  if (previousType === MIKMemberTypes.REMOVED && newType !== MIKMemberTypes.REMOVED) {
    return MemberChangeType.RESTORED
  }
  if (before?.is_membership_approved === false && after?.is_membership_approved === true) {
    return MemberChangeType.APPROVED
  }
  if (previousType !== newType) return MemberChangeType.TYPE_CHANGED

  return MemberChangeType.UPDATED
}

/**
 * Registry change log for the given period, newest change first.
 *
 * `memberType` matches the type either before or after the change, so a member
 * leaving is still listed when filtering by the type they held while a member.
 * System accounts are always excluded.
 */
export async function getMemberChangeLog(
  filters: MemberChangeLogFilters,
): Promise<MemberChangeLogEntry[]> {
  const memberTypes = filters.memberType
    ? Array.isArray(filters.memberType)
      ? filters.memberType
      : [filters.memberType]
    : []

  const newType = sql<string | null>`a.new_data ->> 'member_type'`
  const previousType = sql<string | null>`a.changed_data ->> 'member_type'`

  const rows = await db
    .selectFrom('member.registerAudit as a')
    .leftJoin('member.register as cb', 'cb.memberId', 'a.changedBy')
    .select([
      'a.auditId',
      'a.memberId',
      'a.operationType',
      'a.changedAt',
      'a.changedBy',
      'a.changedData',
      'a.newData',
      'cb.firstName as changedByFirstName',
      'cb.lastName as changedByLastName',
    ])
    .where(sql`a.changed_at::date`, '>=', sql`${filters.startDate}::date`)
    .where(sql`a.changed_at::date`, '<=', sql`${filters.endDate}::date`)
    .where(
      sql<boolean>`coalesce(${newType}, ${previousType}) is distinct from ${MIKMemberTypes.SYSTEM}`,
    )
    .$if(memberTypes.length > 0, (qb) =>
      qb.where((eb) =>
        eb.or([eb(newType, 'in', memberTypes), eb(previousType, 'in', memberTypes)]),
      ),
    )
    .orderBy('a.changedAt', 'desc')
    .orderBy('a.auditId', 'desc')
    .execute()

  return rows
    .map((row) => {
      const before = row.changedData as AuditSnapshot
      const after = row.newData as AuditSnapshot
      const snapshot = after ?? before

      return {
        auditId: row.auditId,
        memberId: row.memberId,
        firstName: (snapshot?.first_name as string) ?? '',
        lastName: (snapshot?.last_name as string) ?? '',
        memberType: ((after ?? before)?.member_type as MIKMemberTypes) ?? null,
        previousMemberType: (before?.member_type as MIKMemberTypes) ?? null,
        operationType: row.operationType as MemberChangeLogEntry['operationType'],
        changeType: classifyChange(row.operationType, before, after),
        changedFields: changedColumns(before, after),
        changedAt: row.changedAt.toISOString(),
        changedBy: row.changedBy,
        changedByName:
          row.changedByFirstName && row.changedByLastName
            ? `${row.changedByFirstName} ${row.changedByLastName}`
            : null,
      }
    })
    .filter(
      // Drop UPDATEs that only touched ignored columns (background sync churn)
      (entry) => entry.operationType !== 'UPDATE' || entry.changedFields.length > 0,
    )
}
