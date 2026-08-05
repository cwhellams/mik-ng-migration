import { z } from 'zod'

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

export const MailboxListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

export type MailboxListQuery = z.infer<typeof MailboxListQuerySchema>
