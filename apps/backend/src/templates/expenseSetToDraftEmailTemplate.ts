import { markdownEmailTemplate } from './emailTemplate.ts'
import { MIKLang } from '../routes/members/models.ts'

export function expenseSetToDraftEmailTemplate(
  lang: MIKLang | string,
  vars: { memberName: string; claimTitle: string; claimUrl: string },
): { subject: string; html: string } {
  const subject =
    lang === MIKLang.FI
      ? `Kuluhakemus palautettu luonnokseksi: ${vars.claimTitle}`
      : lang === MIKLang.SV
        ? `Utgiftsanmälan återförd till utkast: ${vars.claimTitle}`
        : `Expense claim returned to draft: ${vars.claimTitle}`

  const file =
    lang === MIKLang.FI
      ? 'expense-set-to-draft-fi.md'
      : lang === MIKLang.SV
        ? 'expense-set-to-draft-sv.md'
        : 'expense-set-to-draft-en.md'

  return { subject, html: markdownEmailTemplate(file, vars) }
}
