import { z } from 'zod'

import { AuditableSchema, BooleanSchema, LocalisedSchema, optionalTrimmedString } from './schema.ts'

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

  // can reveal HETU on mileage claims and run the Tulorekisteri report (treasurer/chairman only)
  EXPENSE_HETU_ADMIN = 'expense.hetu_admin',

  // can browse the club inventory
  INVENTORY_USER = 'inventory.user',

  // can create/edit/delete inventory items, locations and categories
  INVENTORY_ADMIN = 'inventory.admin',

  // can reserve club items (life vests, oxygen tanks) in the item calendar
  INVENTORY_RESERVATION_USER = 'inventory_reservation.user',

  // can reserve on any member's behalf, and manage the physical units of an item
  INVENTORY_RESERVATION_ADMIN = 'inventory_reservation.admin',

  // can submit AME recommendations
  AME_USER = 'ame.user',

  // can approve/reject AME submissions (committee)
  AME_ADMIN = 'ame.admin',

  // can join general meetings and vote remotely
  MEETING_USER = 'meeting.user',

  // can manage general meetings and voting
  MEETING_ADMIN = 'meeting.admin',

  // CAMO members can view and comment on occurrences shared with them by SMS
  CAMO_USER = 'camo.user',

  // can report fuel and oil uplifts (every flying member)
  LIQUID_USER = 'liquid.user',

  // can manage oil canister inventory and QR codes, and can edit or delete a
  // member's locked liquid record -- except one linked to an expense claim,
  // which is immutable for everyone. Fuel tax rates are configured by
  // EXPENSE_ADMIN (the treasurer), not this permission.
  LIQUID_ADMIN = 'liquid.admin',
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

    case MIKPermissions.INVENTORY_ADMIN:
      return MIKPermissions.INVENTORY_USER
    case MIKPermissions.INVENTORY_RESERVATION_ADMIN:
      return MIKPermissions.INVENTORY_RESERVATION_USER
    case MIKPermissions.MEETING_ADMIN:
      return MIKPermissions.MEETING_USER

    case MIKPermissions.AME_ADMIN:
      return MIKPermissions.AME_USER

    case MIKPermissions.LIQUID_ADMIN:
      return MIKPermissions.LIQUID_USER

    // no separate user role for events – all members can read events
    case MIKPermissions.EVENTS_ADMIN:
      return undefined
    case MIKPermissions.EXPENSE_ADMIN:
      return MIKPermissions.EXPENSE_USER

    // no separate user roles for SMS, outbox, HETU-reveal, or CAMO permissions
    case MIKPermissions.SMS_PROCESSOR:
    case MIKPermissions.SMS_MANAGER:
    case MIKPermissions.OUTBOX_ADMIN:
    case MIKPermissions.EXPENSE_HETU_ADMIN:
    case MIKPermissions.CAMO_USER:
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

// The generated fallback avatar shown when a member has no uploaded photo. Chosen by
// the member; rendered client-side by @dicebear (see UserAvatar in @mik/ui).
export enum DicebearAvatarStyle {
  INITIALS = 'initials',
  AVATAAARS = 'avataaars',
  BOTTTS = 'bottts',
}

export const UpdateAvatarStyleRequestSchema = z.object({
  style: z.nativeEnum(DicebearAvatarStyle),
})
export type UpdateAvatarStyleRequest = z.infer<typeof UpdateAvatarStyleRequestSchema>

// roles endpoint

export const MemberRoleSchema = AuditableSchema.extend({
  roleId: z.string().max(20),
  description: z.string().nullable(),
  // Was a `LocalizedSchema` declared here — the same `{en, fi, sv}` object as
  // `LocalisedSchema` in ./schema.ts, spelled with a z and built from computed
  // MIKLang keys, used by this one field while the other was used twenty times
  // over. Issue #1115 finding 3 is about exactly this shape being defined twice.
  name: LocalisedSchema,
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
  /** Short-lived presigned URL for an uploaded avatar; absent when the member has none. */
  avatarUrl: z.string().nullish(),
  /** Generated fallback avatar style, used whenever avatarUrl is absent. */
  avatarStyle: z.nativeEnum(DicebearAvatarStyle).optional(),
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
    aircraftTypesFlown: optionalTrimmedString(z.string().max(500)),
    pilotLicenceType: z.nativeEnum(PilotLicenceType).optional(),
    pilotLicenceTypeOther: optionalTrimmedString(z.string().max(200)),
    ratings: z.array(z.nativeEnum(AircraftRating)).optional(),
    ratingsOther: optionalTrimmedString(z.string().max(200)),
    primaryMotivation: z.nativeEnum(PrimaryMotivation),
    motivationOther: optionalTrimmedString(z.string().max(500)),
    coverLetter: z.string().trim().min(1).max(2000),
    voluntaryWork: z.string().trim().min(1).max(1000),
    otherAviationClubs: optionalTrimmedString(z.string().max(500)),
    accidentHistory: z.boolean(),
    accidentHistoryDetails: optionalTrimmedString(z.string().max(1000)),
    criminalRecord: z.boolean(),
    criminalRecordDetails: optionalTrimmedString(z.string().max(1000)),
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
  /** ISO 3166-1 alpha-2 country selected alongside phoneNumber — dial codes like +44 are ambiguous on their own. */
  phoneCountry: z.string().length(2).nullish(),
  streetAddress: z.string().nullish(),
  postcode: z.string().nullish(),
  townCity: z.string().nullish(),
  /** ISO 3166-1 alpha-2 country code, e.g. 'FI' */
  country: z.string().regex(/^[A-Z]{2}$/, 'member.countryInvalid'),

  iceContactName: z.string().nullish(),
  iceContactPhoneNumber: z.string().nullish(),
  iceContactPhoneCountry: z.string().length(2).nullish(),

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
  defaultInstructorMemberId: z.string().nullable().optional(),
  /** Short-lived presigned URL for an uploaded avatar; absent when the member has none. */
  avatarUrl: z.string().nullish(),
  /** Generated fallback avatar style, used whenever avatarUrl is absent. */
  avatarStyle: z.nativeEnum(DicebearAvatarStyle).optional(),
})

export type Member = z.infer<typeof MemberSchema>

// Limited number of member fields the user can edit, the rest are for admins only
// Note: email is intentionally excluded — email changes go through a dedicated
// verification flow (POST /me/email-change/request + /verify) to prevent lockouts.
export const MemberProfileSchema = MemberSchema.pick({
  firstName: true,
  lastName: true,

  phoneNumber: true,
  phoneCountry: true,
  streetAddress: true,
  postcode: true,
  townCity: true,
  country: true,

  iceContactName: true,
  iceContactPhoneNumber: true,
  iceContactPhoneCountry: true,

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
  defaultInstructorMemberId: true,
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
  phoneCountry: z.preprocess((v) => (v === '' ? null : v), z.string().length(2).nullish()),
  iceContactPhoneCountry: z.preprocess(
    (v) => (v === '' ? null : v),
    z.string().length(2).nullish(),
  ),
})

export const MemberAdminPatchSchema = MemberSchema.omit({
  createdAt: true,
  createdBy: true,
  updatedAt: true,
  updatedBy: true,
  memberId: true,
  mustUpdateProfile: true,
  emailVerifiedAt: true,
  // Both have dedicated endpoints (POST/DELETE /me/avatar, PATCH /me/avatar-style) and are
  // not member-settable attributes — avatarUrl in particular is a short-lived presigned
  // URL, not something a PATCH payload should ever be able to write.
  avatarUrl: true,
  avatarStyle: true,
}).extend({
  email: z.string().email(),
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

// member registry change log endpoint

/**
 * Derived classification of a single `member.register_audit` row. The raw
 * INSERT/UPDATE/DELETE operation says nothing about what actually happened to
 * the membership, so the interesting transitions are named explicitly.
 */
export enum MemberChangeType {
  /** A new row was added to the register (a membership application) */
  REGISTERED = 'REGISTERED',
  /** Membership application was approved — the member joined the club */
  APPROVED = 'APPROVED',
  /** Member type changed to REMOVED — the member left the club */
  LEFT = 'LEFT',
  /** Member type changed away from REMOVED — a removal was reverted */
  RESTORED = 'RESTORED',
  /** Member type changed between two non-REMOVED types (e.g. JUNIOR → FLYING) */
  TYPE_CHANGED = 'TYPE_CHANGED',
  /** Any other edit of the member's details */
  UPDATED = 'UPDATED',
  /** The row was hard-deleted from the register */
  DELETED = 'DELETED',
}

const strictDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (val) => {
      const d = new Date(`${val}T00:00:00Z`)
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === val
    },
    {
      message: 'Invalid calendar date',
    },
  )

export const MemberChangeLogFiltersSchema = z.object({
  startDate: strictDate,
  endDate: strictDate,
  memberType: z
    .nativeEnum(MIKMemberTypes)
    .or(z.array(z.nativeEnum(MIKMemberTypes)))
    .nullish(),
})

export type MemberChangeLogFilters = z.infer<typeof MemberChangeLogFiltersSchema>

export const MemberChangeLogEntrySchema = z.object({
  auditId: z.number(),
  memberId: z.string(),
  /** Name as recorded in the audit snapshot, i.e. as it was at the time of the change */
  firstName: z.string(),
  lastName: z.string(),
  /** Member type after the change (for DELETE, the type the member had when deleted) */
  memberType: z.nativeEnum(MIKMemberTypes).nullable(),
  /** Member type before the change, null for INSERT */
  previousMemberType: z.nativeEnum(MIKMemberTypes).nullable(),
  operationType: z.enum(['INSERT', 'UPDATE', 'DELETE']),
  changeType: z.nativeEnum(MemberChangeType),
  /** Register columns whose value changed, snake_case, empty for INSERT/DELETE */
  changedFields: z.array(z.string()),
  changedAt: z.string().datetime(),
  changedBy: z.string(),
  /** Full name of the member who made the change, null if that account is gone */
  changedByName: z.string().nullable(),
})

export type MemberChangeLogEntry = z.infer<typeof MemberChangeLogEntrySchema>

export const MemberChangeLogSummarySchema = z.object({
  /** Memberships that became approved during the period */
  newMembers: z.number(),
  /** Memberships that were removed or deleted during the period */
  leftMembers: z.number(),
  totalChanges: z.number(),
})

export type MemberChangeLogSummary = z.infer<typeof MemberChangeLogSummarySchema>

export const MemberChangeLogResponseSchema = z.object({
  entries: z.array(MemberChangeLogEntrySchema),
  summary: MemberChangeLogSummarySchema,
  filters: MemberChangeLogFiltersSchema,
})

export type MemberChangeLogResponse = z.infer<typeof MemberChangeLogResponseSchema>

export const MemberDeletabilitySchema = z.object({
  canDelete: z.boolean(),
  hasInvoices: z.boolean(),
  hasFlights: z.boolean(),
  hasBookings: z.boolean(),
  hasBrevoId: z.boolean(),
})

export type MemberDeletability = z.infer<typeof MemberDeletabilitySchema>

export const RestoreMemberResponseSchema = z.object({
  member: MemberSchema,
  hadCreditedFee: z.boolean(),
})

export type RestoreMemberResponse = z.infer<typeof RestoreMemberResponseSchema>
