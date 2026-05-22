import { z } from 'zod'

import { AuditableSchema } from '../../types/schema.ts'

export const SecretClassEnum = z.enum(['MEMBER', 'BOARD'])
export type SecretClass = z.infer<typeof SecretClassEnum>

// Secrets (Access Codes) schema and types
export const SecretSchema = AuditableSchema.extend({
  id: z.number(),
  secretKey: z.string().min(1).max(100),
  secretValue: z.string().min(1).max(500),
  secretClass: SecretClassEnum,
})

export type Secret = z.infer<typeof SecretSchema>

export const SecretCreateSchema = SecretSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
}).extend({
  secretClass: SecretClassEnum.default('MEMBER'),
})

export type SecretCreate = z.infer<typeof SecretCreateSchema>

export const SecretUpdateSchema = SecretCreateSchema.partial()

export type SecretUpdate = z.infer<typeof SecretUpdateSchema>

export const SecretsListResponseSchema = z.object({
  secrets: z.array(SecretSchema),
})

export type SecretsListResponse = z.infer<typeof SecretsListResponseSchema>
