import type { MIKLang } from '../routes/members/models.ts'
import { markdownEmailTemplate } from './emailTemplate.ts'

const BILLING_EMAIL = 'laskutus@mik.fi'

export type OverdueInvoiceEmailVars = {
  firstName: string
  invoiceId: string
  amount: number
  dueDate: string
}

export const overdueInvoiceEmailSubject = (lang: string | undefined): string =>
  lang === 'fi' ? 'MIK - Muistutus erääntyneestä laskusta' : 'MIK - Overdue Invoice Reminder'

export const overdueInvoiceEmailBodyHtml = (lang: MIKLang, vars: OverdueInvoiceEmailVars): string =>
  markdownEmailTemplate(`overdue-invoice-en.md`, { ...vars, BILLING_EMAIL })
