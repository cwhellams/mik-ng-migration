import { z } from 'zod'
import { OptionalLimitOffsetSchema } from './schema.ts'

export const MailboxSeveritySchema = z.enum(['info', 'warning', 'error', 'success'])
export type MailboxSeverity = z.infer<typeof MailboxSeveritySchema>

export const MailboxMessageSchema = z.object({
  id: z.string(),
  type: z.string(),
  severity: MailboxSeveritySchema,
  title: z.string(),
  body: z.string().nullable(),
  createdAt: z.string(),
  readAt: z.string().nullable(),
})

export type MailboxMessage = z.infer<typeof MailboxMessageSchema>

export const MailboxListQuerySchema = OptionalLimitOffsetSchema()

export type MailboxListQuery = z.infer<typeof MailboxListQuerySchema>
