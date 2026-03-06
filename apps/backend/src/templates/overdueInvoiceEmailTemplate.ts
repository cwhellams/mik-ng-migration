import { MIKLang } from '../routes/members/models.ts'
import { markdownEmailTemplate } from './emailTemplate.ts'

const BILLING_EMAIL = 'laskutus@mik.fi'

export type OverdueInvoiceEmailVars = {
  firstName: string
  invoiceId: string
  amount: number
  dueDate: string
}

export const overdueInvoiceEmailSubject = (lang: string | undefined): string => {
  switch (lang) {
    case MIKLang.FI:
      return 'MIK - Muistutus erääntyneestä laskusta'
    case MIKLang.SV:
      return 'MIK - Påminnelse om förfallen faktura'
    default:
      return 'MIK - Overdue Invoice Reminder'
  }
}
export const overdueInvoiceEmailBodyHtml = (
  lang: MIKLang,
  vars: OverdueInvoiceEmailVars,
): string => {
  const template = `overdue-invoice-${lang}.md`
  return markdownEmailTemplate(template, { ...vars, BILLING_EMAIL })
}
