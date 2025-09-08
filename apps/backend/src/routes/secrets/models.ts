import { z } from 'zod'

import { AuditableSchema } from '../../types/schema.ts'

// Secrets (Access Codes) schema and types
export const SecretSchema = AuditableSchema.extend({
  id: z.number(),
  secretKey: z.string().min(1).max(100),
  secretValue: z.string().min(1).max(500),
})

export type Secret = z.infer<typeof SecretSchema>

export const SecretCreateSchema = SecretSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
})

export type SecretCreate = z.infer<typeof SecretCreateSchema>

export const SecretUpdateSchema = SecretCreateSchema.partial()

export type SecretUpdate = z.infer<typeof SecretUpdateSchema>

export const SecretsListResponseSchema = z.object({
  secrets: z.array(SecretSchema),
})

export type SecretsListResponse = z.infer<typeof SecretsListResponseSchema>
