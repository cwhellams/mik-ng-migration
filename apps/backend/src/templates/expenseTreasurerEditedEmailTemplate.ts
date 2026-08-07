import { markdownEmailTemplate } from './emailTemplate.ts'
import { MIKLang } from '../routes/members/models.ts'

export function expenseTreasurerEditedEmailTemplate(
  lang: MIKLang | string,
  vars: { memberName: string; claimTitle: string; claimUrl: string; changesSummary: string },
): { subject: string; html: string } {
  const subject =
    lang === MIKLang.FI
      ? `Kuluhakemustasi korjattiin: ${vars.claimTitle}`
      : lang === MIKLang.SV
        ? `Din utgiftsanmälan korrigerades: ${vars.claimTitle}`
        : `Your expense claim was corrected: ${vars.claimTitle}`

  const file =
    lang === MIKLang.FI
      ? 'expense-treasurer-edited-fi.md'
      : lang === MIKLang.SV
        ? 'expense-treasurer-edited-sv.md'
        : 'expense-treasurer-edited-en.md'

  return { subject, html: markdownEmailTemplate(file, vars) }
}
