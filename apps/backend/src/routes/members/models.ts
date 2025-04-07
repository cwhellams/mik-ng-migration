import { z } from 'zod'

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
}

export enum MIKMemberTypes {
  FLYING = 'FLYING',
  NONFLYING = 'NON-FLYING',
  JUNIOR = 'JUNIOR',
  EXTERNAL = 'EXTERNAL',
}

// roles endpoint

export const MemberRoleSchema = z.object({
  roleId: z.string().max(20),
  description: z.string().nullable(),
  isPublic: z.boolean(),
  permissions: z.array(z.nativeEnum(MIKPermissions)),
  createdAt: z.string().datetime(),
  createdBy: z.number(),
  updatedAt: z.string().datetime(),
  updatedBy: z.number(),
})
export type MemberRole = z.infer<typeof MemberRoleSchema>

export const UpsertMemberRoleSchema = MemberRoleSchema.partial({
  createdAt: true,
  createdBy: true,
  updatedAt: true,
  updatedBy: true,
})
export type UpsertMemberRole = z.infer<typeof UpsertMemberRoleSchema>

export const MemberRolesResponseSchema = z.object({
  roles: z.array(MemberRoleSchema),
  permissions: z.array(z.nativeEnum(MIKPermissions)),
})
export type MemberRolesResponse = z.infer<typeof MemberRolesResponseSchema>

// member list endpoint

const MemberListSchema = z.object({
  name: z.string(),
  memberId: z.number(),
  phoneNumber: z.string().nullish(),
  roles: z.array(z.string()),
})

export type MemberList = z.infer<typeof MemberListSchema>

export const MemberListFiltersSchema = z.object({
  name: z.string().optional(),
  role: z.string().optional(),
})

export type MemberListFilters = z.infer<typeof MemberListFiltersSchema>

export const MemberListResponseSchema = z.object({
  members: z.array(MemberListSchema),
})

export type MemberListResponse = z.infer<typeof MemberListResponseSchema>

// member details endpoint

export const MemberSchema = z.object({
  memberId: z.number(),
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

  isTrainingProgramPilot: z.boolean(),
  canMakeReservations: z.boolean(),
  billingId: z.string().nullish(),
  dateOfBirth: z.string().date().nullish(),
  memberSince: z.string().date(),

  createdAt: z.string().datetime(),
  createdBy: z.number(),
  updatedAt: z.string().datetime(),
  updatedBy: z.number(),
  emailVerifiedAt: z.string().datetime().optional(),

  roles: z.array(
    MemberRoleSchema.partial({
      description: true,
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
})

export type MemberProfile = z.infer<typeof MemberProfileSchema>
export type MemberResponse = z.infer<typeof MemberSchema>
