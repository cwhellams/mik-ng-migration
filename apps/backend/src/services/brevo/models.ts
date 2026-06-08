import { z } from 'zod'
import { MIKLang, MIKMemberTypes } from '../../routes/members/models.ts'

// Brevo Contact Attributes
export const BrevoContactAttributesSchema = z.object({
  FIRSTNAME: z.string(),
  LASTNAME: z.string(),
  MEMBER_TYPE: z.nativeEnum(MIKMemberTypes),
  LANG_ISO639: z.nativeEnum(MIKLang),
  IS_MEMBERSHIP_EXPIRED: z.boolean(),
  EMAIL_VERIFIED: z.boolean(),
})

export type BrevoContactAttributes = z.infer<typeof BrevoContactAttributesSchema>

// Brevo Contact Request
export const BrevoCreateContactRequestSchema = z.object({
  email: z.string().email(),
  ext_id: z.string(), // member_id from database
  attributes: BrevoContactAttributesSchema,
  listIds: z.array(z.number()).optional(),
  updateEnabled: z.boolean().optional(),
})

export type BrevoCreateContactRequest = z.infer<typeof BrevoCreateContactRequestSchema>

export const BrevoUpdateContactRequestSchema = z.object({
  attributes: BrevoContactAttributesSchema.partial(),
  listIds: z.array(z.number()).optional(),
  unlinkListIds: z.array(z.number()).optional(),
})

export type BrevoUpdateContactRequest = z.infer<typeof BrevoUpdateContactRequestSchema>

// Brevo Contact Response
export const BrevoContactSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  emailBlacklisted: z.boolean(),
  smsBlacklisted: z.boolean(),
  createdAt: z.string(),
  modifiedAt: z.string(),
  attributes: BrevoContactAttributesSchema,
  listIds: z.array(z.number()),
})

export type BrevoContact = z.infer<typeof BrevoContactSchema>

// Brevo API Error Response
export const BrevoErrorResponseSchema = z.object({
  code: z.string(),
  message: z.string(),
})

export type BrevoErrorResponse = z.infer<typeof BrevoErrorResponseSchema>

// Brevo List IDs based on member type - these should match the lists created in Brevo
export enum BrevoListId {
  FLYING = 5,
  NON_FLYING = 7,
  JUNIOR = 6,
  ALL = 4,
  REMOVED = 8,
}

export const MemberTypeToBrevoListId: Partial<Record<MIKMemberTypes, number>> = {
  [MIKMemberTypes.FLYING]: BrevoListId.FLYING,
  [MIKMemberTypes.NONFLYING]: BrevoListId.NON_FLYING,
  [MIKMemberTypes.JUNIOR]: BrevoListId.JUNIOR,
  [MIKMemberTypes.REMOVED]: BrevoListId.REMOVED,
  // EXTERNAL members are not synced to any Brevo list
  // HONORARY members are synced to the ALL list (like other active members) but have no type-specific list
}

export const BrevoSyncStatusSchema = z.enum(['PENDING', 'SYNCED', 'FAILED'])
export type BrevoSyncStatus = z.infer<typeof BrevoSyncStatusSchema>

export const BrevoSyncStateStatusSchema = z.enum(['SUCCESS', 'FAILED', 'IN_PROGRESS'])
export type BrevoSyncStateStatus = z.infer<typeof BrevoSyncStateStatusSchema>
