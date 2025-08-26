import { z } from 'zod'

import { AuditableSchema } from '../../types/schema.ts'

export enum MIKPermissions {
  // can see other club members and their public roles
  MEMBER = 'member',

  // can manage all members and their roles
  MEMBER_ADMIN = 'member.admin',

  // can see flights, add new and edit own flights until billed
  FLIGHTLOG_USER = 'flightlog.user',
  FLIGHTLOG_ADMIN = 'flightlog.admin',

  // can see bookings, add new and edit own bookings
  BOOKING_USER = 'booking.user',
  BOOKING_ADMIN = 'booking.admin',

  // can see plane hours, hangar codes
  AIRCRAFT_USER = 'aircraft.user',
  AIRCRAFT_ADMIN = 'aircraft.admin',

  // can see invoices, admin can create and edit
  INVOICING_USER = 'invoicing.user',
  INVOICING_ADMIN = 'invoicing.admin',
}

export const toUserRole = (permission: MIKPermissions): MIKPermissions => {
  switch (permission) {
    case MIKPermissions.MEMBER_ADMIN:
      return MIKPermissions.MEMBER
    case MIKPermissions.FLIGHTLOG_ADMIN:
      return MIKPermissions.FLIGHTLOG_USER
    case MIKPermissions.BOOKING_ADMIN:
      return MIKPermissions.BOOKING_USER
    case MIKPermissions.AIRCRAFT_ADMIN:
      return MIKPermissions.AIRCRAFT_USER
    case MIKPermissions.INVOICING_ADMIN:
      return MIKPermissions.INVOICING_USER
    default:
      return permission
  }
}

export enum MIKMemberTypes {
  FLYING = 'FLYING',
  NONFLYING = 'NON-FLYING',
  JUNIOR = 'JUNIOR',
  EXTERNAL = 'EXTERNAL',
  HONORARY = 'HONORARY',
}

export enum MIKLang {
  FI = 'fi',
  EN = 'en',
  SV = 'sv',
}

// roles endpoint

export const LocalizedSchema = z.object({
  [MIKLang.EN]: z.string(),
  [MIKLang.FI]: z.string(),
  [MIKLang.SV]: z.string(),
})

export const MemberRoleSchema = AuditableSchema.extend({
  roleId: z.string().max(20),
  description: z.string().nullable(),
  name: LocalizedSchema,
  isPublic: z.boolean(),
  permissions: z.array(z.nativeEnum(MIKPermissions)),
})
export type MemberRole = z.infer<typeof MemberRoleSchema>

export const MemberRolesResponseSchema = z.object({
  roles: z.array(MemberRoleSchema),
  permissions: z.array(z.nativeEnum(MIKPermissions)),
})
export type MemberRolesResponse = z.infer<typeof MemberRolesResponseSchema>

// member list endpoint

const MemberListSchema = z.object({
  first: z.string(),
  last: z.string(),
  memberId: z.string(),
  phoneNumber: z.string().nullish(),
  email: z.string(),
  roles: z.array(z.string()),
})

export type MemberList = z.infer<typeof MemberListSchema>

export const MemberListFiltersSchema = z.object({
  name: z.string().optional(),
  role: z.string().or(z.array(z.string())).nullish(),
  isMembershipApproved: z.boolean().optional(),
})

export type MemberListFilters = z.infer<typeof MemberListFiltersSchema>

export const MemberListResponseSchema = z.object({
  members: z.array(MemberListSchema),
})

export type MemberListResponse = z.infer<typeof MemberListResponseSchema>

// member details endpoint

export const MemberSchema = AuditableSchema.extend({
  memberId: z.string(),
  memberType: z.nativeEnum(MIKMemberTypes),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),

  phoneNumber: z.string().nullish(),
  streetAddress: z.string().nullish(),
  postcode: z.string().nullish(),
  townCity: z.string().nullish(),

  iceContactName: z.string().nullish(),
  iceContactPhoneNumber: z.string().nullish(),

  licenceId: z.string().nullish(),
  licenceExpiry: z.string().date().nullish(),
  medicalExpiry: z.string().date().nullish(),

  isTrainingProgramPilot: z.boolean(),
  isMembershipApproved: z.boolean(),
  canMakeReservations: z.boolean(),
  billingId: z.string().nullish(),
  dateOfBirth: z.string().date().nullish(),
  memberSince: z.string().date(),
  membershipApprovedAt: z.string().datetime().optional(),
  membershipApprovedBy: z.string().optional(),
  emailVerifiedAt: z.string().datetime().optional(),
  lang: z.nativeEnum(MIKLang),
  roles: z.array(
    MemberRoleSchema.partial({
      description: true,
      name: true,
      isPublic: true,
      permissions: true,
      createdAt: true,
      createdBy: true,
      updatedAt: true,
      updatedBy: true,
    }),
  ),
})

export type Member = z.infer<typeof MemberSchema>

// Limited number of member fields the user can edit, the rest are for admins only
export const MemberProfileSchema = MemberSchema.pick({
  email: true,
  firstName: true,
  lastName: true,

  phoneNumber: true,
  streetAddress: true,
  postcode: true,
  townCity: true,

  iceContactName: true,
  iceContactPhoneNumber: true,

  dateOfBirth: true,

  licenceId: true,
  licenceExpiry: true,
  medicalExpiry: true,
})

export type MemberProfile = z.infer<typeof MemberProfileSchema>

export const MemberApprovalSchema = MemberSchema.pick({
  memberId: true,
  membershipApprovedAt: true,
  membershipApprovedBy: true,
  email: true,
  firstName: true,
  lang: true,
})

export type MemberApproval = z.infer<typeof MemberApprovalSchema>
