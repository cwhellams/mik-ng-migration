import { z } from 'zod'

import { AuditableSchema, BooleanSchema } from '../../types/schema.ts'

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

  // can access club secrets/access codes
  ACCESS_CODES_USER = 'access_codes.user',
  ACCESS_CODES_ADMIN = 'access_codes.admin',

  // can see and manage fuel prices page content
  FUEL_PRICES_USER = 'fuelPrices.user',
  FUEL_PRICES_ADMIN = 'fuelPrices.admin',

  // can see club documents, admin can create and edit
  DOCUMENT_USER = 'document.user',
  DOCUMENT_ADMIN = 'document.admin',

  // safety management system roles
  SMS_PROCESSOR = 'sms.processor',
  SMS_MANAGER = 'sms.manager',

  // can view and manage the SimplBooks outbox (admin only, no user downgrade)
  OUTBOX_ADMIN = 'outbox.admin',

  // can browse and purchase from the shop
  STORE_USER = 'store.user',

  // can manage products, categories, orders and flight hour packages
  STORE_ADMIN = 'store.admin',

  // can browse and take exams
  EXAM_USER = 'exam.user',

  // can create/edit/publish exams and view all exam attempts
  EXAM_ADMIN = 'exam.admin',

  // can view own syllabus assignment and select syllabus flights when logging flights
  DTO_USER = 'dto.user',

  // can verify DTO flights (instructor role – flight_instructor / flight_examiner)
  DTO_INSTRUCTOR = 'dto.instructor',

  // can create/edit/import/publish syllabi and assign syllabi to members
  DTO_ADMIN = 'dto.admin',

  // can create, edit and delete club events
  EVENTS_ADMIN = 'events.admin',

  // can submit expense claims
  EXPENSE_USER = 'expense.user',

  // can view and approve/reject expense claims (treasurer / committee)
  EXPENSE_ADMIN = 'expense.admin',
}

// admins can be downgraded to user permissions when not in sudo mode
export const downgradePermission = (permission: MIKPermissions): MIKPermissions | undefined => {
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
    case MIKPermissions.ACCESS_CODES_ADMIN:
      return MIKPermissions.ACCESS_CODES_USER
    case MIKPermissions.FUEL_PRICES_ADMIN:
      return MIKPermissions.FUEL_PRICES_USER
    case MIKPermissions.DOCUMENT_ADMIN:
      return MIKPermissions.DOCUMENT_USER
    case MIKPermissions.STORE_ADMIN:
      return MIKPermissions.STORE_USER
    case MIKPermissions.EXAM_ADMIN:
      return MIKPermissions.EXAM_USER
    case MIKPermissions.DTO_ADMIN:
      return MIKPermissions.DTO_USER

    // no separate user role for events – all members can read events
    case MIKPermissions.EVENTS_ADMIN:
      return undefined
    case MIKPermissions.EXPENSE_ADMIN:
      return MIKPermissions.EXPENSE_USER

    // no separate user roles for SMS or outbox permissions
    case MIKPermissions.SMS_PROCESSOR:
    case MIKPermissions.SMS_MANAGER:
    case MIKPermissions.OUTBOX_ADMIN:
      return undefined
    default:
      return permission
  }
}

export enum MIKMemberTypes {
  FLYING = 'FLYING',
  NONFLYING = 'NON-FLYING',
  JUNIOR = 'JUNIOR',
  HONORARY = 'HONORARY',

  // other type of users
  EXTERNAL = 'EXTERNAL',
  REMOVED = 'REMOVED',
  SYSTEM = 'SYSTEM',
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
  townCity: z.string().nullish(),
  email: z.string(),
  roles: z.array(z.string()),
  lang: z.nativeEnum(MIKLang),
  memberSince: z.string().date().optional(),
  isTrainingProgramPilot: z.boolean().optional(),
  canMakeReservations: z.boolean().optional(),
  automaticBillingStatus: z.boolean().optional(),
  autoRenewAnnualMembership: z.boolean().nullable().optional(),
  autoRenewEquipmentFee: z.boolean().nullable().optional(),
  mustUpdateProfile: z.boolean().optional(),
})

export type MemberList = z.infer<typeof MemberListSchema>

export const MemberListFiltersSchema = z.object({
  name: z.string().optional(),
  role: z.string().or(z.array(z.string())).nullish(),
  memberType: z
    .nativeEnum(MIKMemberTypes)
    .or(z.array(z.nativeEnum(MIKMemberTypes)))
    .nullish(),
  showUnapproved: BooleanSchema.optional(),
  showRemoved: BooleanSchema.optional(),
  showExternal: BooleanSchema.optional(),
})

export type MemberListFilters = z.infer<typeof MemberListFiltersSchema>

export const MemberListResponseSchema = z.object({
  members: z.array(MemberListSchema),
})

export type MemberListResponse = z.infer<typeof MemberListResponseSchema>

// member details endpoint

export enum PrimaryMotivation {
  FLY = 'fly',
  LEARN_TO_FLY = 'learnToFly',
  COMMUNITY = 'community',
  OTHER = 'other',
}

export enum PilotLicenceType {
  LAPL_A = 'LAPL(A)',
  PPL_A = 'PPL(A)',
  CPL_A = 'CPL(A)',
  ATPL_A = 'ATPL(A)',
  OTHER = 'other',
}

export enum AircraftRating {
  SEP_LAND = 'SEP(land)',
  IR = 'IR',
  NF = 'NF',
  OTHER = 'other',
}

export const ApplicationDataSchema = z
  .object({
    totalFlightHours: z.number().min(0).max(99999).optional(),
    aircraftTypesFlown: z.string().max(500).optional(),
    pilotLicenceType: z.nativeEnum(PilotLicenceType).optional(),
    pilotLicenceTypeOther: z.string().max(200).optional(),
    ratings: z.array(z.nativeEnum(AircraftRating)).optional(),
    ratingsOther: z.string().max(200).optional(),
    primaryMotivation: z.nativeEnum(PrimaryMotivation),
    motivationOther: z.string().max(500).optional(),
    coverLetter: z.string().min(1).max(2000),
    voluntaryWork: z.string().min(1).max(1000),
    otherAviationClubs: z.string().max(500).optional(),
    accidentHistory: z.boolean(),
    accidentHistoryDetails: z.string().max(1000).optional(),
    criminalRecord: z.boolean(),
    criminalRecordDetails: z.string().max(1000).optional(),
    gdprAccepted: z.literal(true, { error: () => 'GDPR acceptance is required' }),
  })
  .superRefine((data, ctx) => {
    if (data.pilotLicenceType === PilotLicenceType.OTHER && !data.pilotLicenceTypeOther) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'pilotLicenceTypeOther is required when pilotLicenceType is OTHER',
        path: ['pilotLicenceTypeOther'],
      })
    }
    if (data.ratings?.includes(AircraftRating.OTHER) && !data.ratingsOther) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ratingsOther is required when ratings includes OTHER',
        path: ['ratingsOther'],
      })
    }
    if (data.primaryMotivation === PrimaryMotivation.OTHER && !data.motivationOther) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'motivationOther is required when primaryMotivation is OTHER',
        path: ['motivationOther'],
      })
    }
    if (data.accidentHistory && !data.accidentHistoryDetails) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'accidentHistoryDetails is required when accidentHistory is true',
        path: ['accidentHistoryDetails'],
      })
    }
    if (data.criminalRecord && !data.criminalRecordDetails) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'criminalRecordDetails is required when criminalRecord is true',
        path: ['criminalRecordDetails'],
      })
    }
  })

export type ApplicationData = z.infer<typeof ApplicationDataSchema>

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

  imWhatsapp: z.string().nullish(),
  imTelegram: z.string().nullish(),
  imFacebookMessenger: z.string().nullish(),
  imDiscord: z.string().nullish(),
  imViber: z.string().nullish(),
  imSignal: z.string().nullish(),

  licenceId: z.string().nullish(),
  licenceExpiry: z.string().date().nullish(),
  medicalExpiry: z.string().date().nullish(),
  medicalClass1Expiry: z.string().date().nullish(),
  medicalClass2Expiry: z.string().date().nullish(),
  medicalLaplExpiry: z.string().date().nullish(),

  isTrainingProgramPilot: z.boolean(),
  isMembershipApproved: z.boolean(),
  canMakeReservations: z.boolean(),
  billingId: z.string().nullish(),
  brevoContactId: z.number().nullish(),
  dateOfBirth: z.string().date().nullish(),
  memberSince: z.string().date(),
  iban: z.string().nullish(),
  ibanAccountName: z.string().nullish(),
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
  autoRenewAnnualMembership: z.boolean().nullable().optional(),
  autoRenewEquipmentFee: z.boolean().nullable().optional(),
  isMembershipExpired: z.boolean().nullable().optional(),
  mustUpdateProfile: z.boolean().optional(),
  mailingLists: z.array(z.string()).nullish(),
  applicationData: ApplicationDataSchema.nullish(),
})

export type Member = z.infer<typeof MemberSchema>

// Limited number of member fields the user can edit, the rest are for admins only
// Note: email is intentionally excluded — email changes go through a dedicated
// verification flow (POST /me/email-change/request + /verify) to prevent lockouts.
export const MemberProfileSchema = MemberSchema.pick({
  firstName: true,
  lastName: true,

  phoneNumber: true,
  streetAddress: true,
  postcode: true,
  townCity: true,

  iceContactName: true,
  iceContactPhoneNumber: true,

  imWhatsapp: true,
  imTelegram: true,
  imFacebookMessenger: true,
  imDiscord: true,
  imViber: true,
  imSignal: true,

  dateOfBirth: true,

  licenceId: true,
  licenceExpiry: true,
  medicalExpiry: true,
  medicalClass1Expiry: true,
  medicalClass2Expiry: true,
  medicalLaplExpiry: true,
  autoRenewAnnualMembership: true,
  autoRenewEquipmentFee: true,
  lang: true,
  mailingLists: true,
  iban: true,
  ibanAccountName: true,
}).extend({
  streetAddress: z.string().min(1),
  postcode: z.string().min(1).regex(/^\d+$/, 'member.postcodeDigitsOnly'),
  townCity: z.string().min(1),
  phoneNumber: z.preprocess(
    (v) => (v === '' ? null : v),
    z
      .string()
      .regex(/^\+[0-9\s\-()]+$/, 'member.phoneRequiresCorrectFormatting')
      .nullish(),
  ),
})

export const MemberAdminPatchSchema = MemberSchema.omit({
  mustUpdateProfile: true,
})

export type MemberProfile = z.infer<typeof MemberProfileSchema>

export const AnnualMembershipStatsSchema = z.object({
  totalAutoRenewMembers: z.number(),
  totalAutoRenewEquipmentFee: z.number(),
  year: z.number(),
})

export type AnnualMembershipStats = z.infer<typeof AnnualMembershipStatsSchema>

// Partial member schema for invoice operations
// Uses .passthrough() to strip unknown keys when parsing full member objects
export const InvoiceMemberSchema = MemberSchema.pick({
  memberId: true,
  memberType: true,
  email: true,
  firstName: true,
  lastName: true,
  lang: true,
  autoRenewEquipmentFee: true,
  autoRenewAnnualMembership: true,
  billingId: true,
}).passthrough()

export type InvoiceMember = z.infer<typeof InvoiceMemberSchema>

export const FeeProcessingItemSchema = z.object({
  member_id: z.string(),
  fee_type: z.enum(['annual_fee', 'equipment_fee']),
  year: z.number(),
  created_at: z.date(),
  created_by: z.string(),
})

export type FeeProcessingItem = z.infer<typeof FeeProcessingItemSchema>

// Non-renewal tracking

export enum NonRenewalActionType {
  REMINDER_SENT = 'REMINDER_SENT',
  MEMBERSHIP_CANCELLED = 'MEMBERSHIP_CANCELLED',
}

export const NonRenewalMemberSchema = z.object({
  memberId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  phoneNumber: z.string().nullish(),
  memberType: z.nativeEnum(MIKMemberTypes),
  lang: z.nativeEnum(MIKLang),
  autoRenewAnnualMembership: z.boolean().nullable().optional(),
  /**
   * 'no_record' — no entry in annual_fees for this year
   * 'unpaid'    — fee record exists but the linked invoice has not been paid
   */
  feeStatus: z.enum(['no_record', 'unpaid']),
  /** Date the invoice was sent (date string), or null if no invoice */
  invoiceSentAt: z.string().nullable(),
  /** Invoice due date (date string), or null if no invoice */
  invoiceDueAt: z.string().nullable(),
  /** ISO timestamp of the last REMINDER_SENT action, or null if none */
  lastReminderSentAt: z.string().datetime().nullable(),
  /** Number of flights in the current year where this member is recorded as the billable member */
  billableFlightCount: z.number(),
})

export type NonRenewalMember = z.infer<typeof NonRenewalMemberSchema>

export const NonRenewalListResponseSchema = z.object({
  members: z.array(NonRenewalMemberSchema),
  year: z.number(),
})

export type NonRenewalListResponse = z.infer<typeof NonRenewalListResponseSchema>

export const NonRenewalActionSchema = z.object({
  id: z.number(),
  memberId: z.string(),
  actionType: z.nativeEnum(NonRenewalActionType),
  performedAt: z.string().datetime(),
  performedBy: z.string(),
  notes: z.string().nullable(),
})

export type NonRenewalAction = z.infer<typeof NonRenewalActionSchema>

export const MemberDeletabilitySchema = z.object({
  canDelete: z.boolean(),
  hasInvoices: z.boolean(),
  hasFlights: z.boolean(),
  hasBookings: z.boolean(),
  hasBrevoId: z.boolean(),
})

export type MemberDeletability = z.infer<typeof MemberDeletabilitySchema>
