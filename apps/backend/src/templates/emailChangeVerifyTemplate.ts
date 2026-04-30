import 'dotenv/config'
import { markdownEmailTemplate } from './emailTemplate.ts'
import { MIKLang } from '../routes/members/models.ts'

export type EmailChangeVerifyVars = {
  firstName: string
  newEmail: string
  href: string
}

export const emailChangeVerifySubject = (lang: MIKLang): string => {
  switch (lang) {
    case MIKLang.FI:
      return 'Vahvista uusi sähköpostiosoitteesi'
    case MIKLang.SV:
      return 'Verifiera din nya e-postadress'
    default:
      return 'Verify your new email address'
  }
}

const emailChangeVerifyDisclaimer = (lang: MIKLang): string => {
  switch (lang) {
    case MIKLang.FI:
      return 'Jos et pyytänyt tätä muutosta, voit huoletta sivuuttaa tämän sähköpostin.'
    case MIKLang.SV:
      return 'Om du inte begärde denna ändring kan du lugnt ignorera detta e-postmeddelande.'
    default:
      return "If you didn't request this change, you can safely ignore this email."
  }
}

export const emailChangeVerifyBodyHtml = (lang: MIKLang, vars: EmailChangeVerifyVars): string =>
  markdownEmailTemplate(
    `email-change-verify-${lang}.md`,
    vars,
    emailChangeVerifyDisclaimer(lang),
  )
