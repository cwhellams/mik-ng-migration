import { z } from 'zod'

export const UsefulPhoneNumberSchema = z.object({
  label: z.string().trim().min(1).max(200),
  phoneNumber: z.string().trim().min(1).max(50),
  sortOrder: z.number().int(),
})

export type UsefulPhoneNumber = z.infer<typeof UsefulPhoneNumberSchema>

// label is the primary key, set on create and immutable afterwards (passed via the
// URL for updates), so it's not part of the update body.
export const UsefulPhoneNumberUpdateSchema = UsefulPhoneNumberSchema.omit({ label: true })

export type UsefulPhoneNumberUpdateRequest = z.infer<typeof UsefulPhoneNumberUpdateSchema>

export type UsefulPhoneNumberListResponse = UsefulPhoneNumber[]
