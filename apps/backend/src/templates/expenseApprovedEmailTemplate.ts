import { markdownEmailTemplate } from './emailTemplate.ts'
import { MIKLang } from '../routes/members/models.ts'

export function expenseApprovedEmailTemplate(
  lang: MIKLang | string,
  vars: { memberName: string; claimTitle: string; claimUrl: string },
): { subject: string; html: string } {
  const subject =
    lang === MIKLang.FI
      ? `Kulukorvaus hyväksytty: ${vars.claimTitle}`
      : lang === MIKLang.SV
        ? `Utgiftsanspråk godkänt: ${vars.claimTitle}`
        : `Expense claim approved: ${vars.claimTitle}`
  const file =
    lang === MIKLang.FI
      ? 'expense-approved-fi.md'
      : lang === MIKLang.SV
        ? 'expense-approved-sv.md'
        : 'expense-approved-en.md'
  return { subject, html: markdownEmailTemplate(file, vars) }
}
