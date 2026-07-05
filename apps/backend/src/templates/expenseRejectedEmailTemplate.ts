import { markdownEmailTemplate } from './emailTemplate.ts'
import { MIKLang } from '../routes/members/models.ts'

export function expenseRejectedEmailTemplate(
  lang: MIKLang | string,
  vars: { memberName: string; claimTitle: string; rejectionReason: string; claimUrl: string },
): { subject: string; html: string } {
  const subject =
    lang === MIKLang.FI
      ? `Kulukorvaus hylätty: ${vars.claimTitle}`
      : lang === MIKLang.SV
        ? `Utgiftsanspråk avvisat: ${vars.claimTitle}`
        : `Expense claim rejected: ${vars.claimTitle}`
  const file =
    lang === MIKLang.FI
      ? 'expense-rejected-fi.md'
      : lang === MIKLang.SV
        ? 'expense-rejected-sv.md'
        : 'expense-rejected-en.md'
  return { subject, html: markdownEmailTemplate(file, vars) }
}
