import { markdownEmailTemplate } from './emailTemplate.ts'
import { MIKLang } from '../routes/members/models.ts'

export type NonRenewalReminderVars = {
  firstName: string
  year: number
}

export const nonRenewalReminderEmailSubject = (lang: MIKLang): string => {
  switch (lang) {
    case MIKLang.FI:
      return 'Viimeinen muistutus: jäsenmaksusi on maksamatta - jäsenyytesi päättyy pian - Malmin Ilmailukerho'
    case MIKLang.SV:
      return 'Sista påminnelsen: din medlemsavgift är obetald – ditt medlemskap upphör snart – Malmin Ilmailukerho'
    default:
      return 'Last reminder: your membership fee is unpaid - your membership will end soon - Malmin Ilmailukerho'
  }
}

export const nonRenewalReminderEmailBodyHtml = (
  lang: MIKLang,
  vars: NonRenewalReminderVars,
): string => markdownEmailTemplate(`member-nonrenewal-reminder-${lang}.md`, vars)
