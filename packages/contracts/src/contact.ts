import { z } from 'zod'
import { MIKLang } from './members.ts'

export enum ContactCategory {
  TRAINING = 'TRAINING',
  MEMBERSHIP = 'MEMBERSHIP',
  OTHER = 'OTHER',
}

export const ContactRequestSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().email(),
  category: z.nativeEnum(ContactCategory),
  message: z.string().trim().min(1).max(4000),
  lang: z.nativeEnum(MIKLang),
  turnstileToken: z.string().optional(),
})

export type ContactRequest = z.infer<typeof ContactRequestSchema>
