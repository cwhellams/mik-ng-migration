import { markdownEmailTemplate } from './emailTemplate.ts'
import { MIKLang } from '../routes/members/models.ts'

export function expenseRequestInfoEmailTemplate(
  lang: MIKLang | string,
  vars: { memberName: string; claimTitle: string; adminMessage: string; claimUrl: string },
): { subject: string; html: string } {
  const subject =
    lang === MIKLang.FI
      ? `Lisätietoja vaaditaan: ${vars.claimTitle}`
      : lang === MIKLang.SV
        ? `Ytterligare information krävs: ${vars.claimTitle}`
        : `Further information required: ${vars.claimTitle}`
  const file =
    lang === MIKLang.FI
      ? 'expense-request-info-fi.md'
      : lang === MIKLang.SV
        ? 'expense-request-info-sv.md'
        : 'expense-request-info-en.md'
  return { subject, html: markdownEmailTemplate(file, vars) }
}
