import { z } from 'zod'

// Aircraft pricing for public display
export const PublicAircraftPricingSchema = z.object({
  registration: z.string(),
  price_per_min: z.number(),
  valid_from: z.string().date(),
  valid_to: z.string().date().nullable(),
})

export type PublicAircraftPricing = z.infer<typeof PublicAircraftPricingSchema>

// Membership fee for public display
export const PublicMembershipFeeSchema = z.object({
  code: z.string(),
  name: z.string(),
  price: z.number(),
  description: z.string().nullable().optional(),
})

export type PublicMembershipFee = z.infer<typeof PublicMembershipFeeSchema>

// Equipment fee for public display
export const PublicEquipmentFeeSchema = z.object({
  code: z.string(),
  name: z.string(),
  price: z.number(),
  description: z.string().nullable().optional(),
})

export type PublicEquipmentFee = z.infer<typeof PublicEquipmentFeeSchema>

// Complete public prices response
export const PublicPricesResponseSchema = z.object({
  aircraft: z.array(PublicAircraftPricingSchema),
  membershipFees: z.array(PublicMembershipFeeSchema),
  equipmentFee: PublicEquipmentFeeSchema.nullable(),
})

export type PublicPricesResponse = z.infer<typeof PublicPricesResponseSchema>
