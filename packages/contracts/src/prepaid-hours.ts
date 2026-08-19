import { z } from 'zod'
import { AuditableSchema, nullableTrimmedString, optionalTrimmedString } from './schema.ts'

// ── Package definition ────────────────────────────────────────────────────────
export const PrepaidPackageSchema = AuditableSchema.extend({
  productId: z.string().max(9),
  nameEn: z.string().trim().min(1).max(200).optional(),
  nameFi: z.string().trim().min(1).max(200).optional(),
  nameSv: z.string().trim().min(1).max(200).optional(),
  descriptionEn: optionalTrimmedString(z.string().max(2000)),
  descriptionFi: optionalTrimmedString(z.string().max(2000)),
  descriptionSv: optionalTrimmedString(z.string().max(2000)),
  aircraftRegistration: z.string().max(9),
  minutesPerPackage: z.number().int().positive(),
  perMinRate: z.number().nonnegative(),
  totalPrice: z.number().nonnegative().optional(),
  totalPackagesAvailable: z.number().int().positive(),
  maxPerMember: z.number().int().positive().nullable().optional(),
  soldCount: z.number().int().nonnegative().default(0),
  simplbooksItemId: z.string().max(100).nullable().optional(),
  vatPercent: z.number().nonnegative().default(0),
  lowStockThreshold: z.number().int().nonnegative().nullable().optional(),
  expiresAt: z.string().date(),
  isActive: z.boolean().default(true),
})
export type PrepaidPackage = z.infer<typeof PrepaidPackageSchema>

export const PrepaidPackageUpsertSchema = PrepaidPackageSchema.omit({
  productId: true,
  soldCount: true,
  totalPrice: true,
  createdAt: true,
  createdBy: true,
  updatedAt: true,
  updatedBy: true,
}).extend({
  packageId: z.string().max(9).optional(),
  nameEn: z.string().trim().min(1).max(200),
  nameFi: z.string().trim().min(1).max(200),
  nameSv: z.string().trim().min(1).max(200),
  descriptionEn: optionalTrimmedString(z.string().max(2000)),
  descriptionFi: optionalTrimmedString(z.string().max(2000)),
  descriptionSv: optionalTrimmedString(z.string().max(2000)),
  vatPercent: z.number().nonnegative().default(0),
  lowStockThreshold: z.number().int().nonnegative().nullable().optional(),
})
export type PrepaidPackageUpsert = z.infer<typeof PrepaidPackageUpsertSchema>

export const MemberPackageMemberSchema = z.object({
  memberId: z.string().max(9),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email(),
  phoneNumber: z.string().nullable().optional(),
})
export type MemberPackageMember = z.infer<typeof MemberPackageMemberSchema>

// ── Member-owned package ──────────────────────────────────────────────────────
export const MemberPackageSchema = z.object({
  memberPackageId: z.number().int(),
  memberId: z.string().max(9),
  productId: z.string().max(9),
  orderId: z.string().max(9).nullable().optional(),
  totalMinutes: z.number().int().positive(),
  usedMinutes: z.number().int().nonnegative().default(0),
  remainingMinutes: z.number().int().nonnegative(),
  expiresAt: z.string().date(),
  isExpired: z.boolean().default(false),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  unbilledMinutes: z.number().int().nonnegative().optional(),
  member: MemberPackageMemberSchema.optional(),
  package: PrepaidPackageSchema.optional(),
})
export type MemberPackage = z.infer<typeof MemberPackageSchema>

// ── Usage log entry ───────────────────────────────────────────────────────────
export const UsageLogSchema = z.object({
  usageId: z.number().int(),
  memberPackageId: z.number().int(),
  flightId: z.string().max(9).nullable().optional(),
  minutesUsed: z.number().int().positive(),
  appliedAt: z.string().datetime(),
  note: nullableTrimmedString(z.string().max(500)).optional(),
})
export type UsageLog = z.infer<typeof UsageLogSchema>

// ── Unbilled time by aircraft ─────────────────────────────────────────────────
export const UnbilledTimeByAircraftSchema = z.object({
  aircraftRegistration: z.string(),
  airborneMinutes: z.number().int().nonnegative(),
  blockMinutes: z.number().int().nonnegative(),
})
export type UnbilledTimeByAircraft = z.infer<typeof UnbilledTimeByAircraftSchema>

// ── Extend expiry bulk operation ──────────────────────────────────────────────
export const ExtendExpirySchema = z.object({
  aircraftRegistration: z.string().max(9),
  daysToAdd: z.number().int().positive(),
})
export type ExtendExpiry = z.infer<typeof ExtendExpirySchema>
