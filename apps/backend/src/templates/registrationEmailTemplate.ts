import 'dotenv/config'
import { markdownEmailTemplate } from './emailTemplate.ts'
import { MIKLang } from '../routes/members/models.ts'

const MIK_RULES_URL = process.env.MIK_RULES_URL ?? 'https://mik.fi/rules'

export type RegisterVars = {
  firstName: string
  href: string
  code: number
}

export const registerEmailTitle = (lang: string | undefined): string => {
  switch (lang) {
    case 'fi':
      return 'Tervetuloa Malmin ilmailukerhoon'
    case 'sv':
      return 'Välkommen till Malmin Ilmailukerho'
    default:
      return 'Welcome to Malmin Ilmailukerho'
  }
}

const registerEmailDisclaimer = (lang: MIKLang): string => {
  switch (lang) {
    case MIKLang.FI:
      return 'Jos et pyytänyt tätä sähköpostia, voit huoletta sivuuttaa sen.'
    case MIKLang.SV:
      return 'Om du inte begärde detta e-postmeddelande kan du lugnt ignorera det.'
    default:
      return "If you didn't request this email, you can safely ignore it."
  }
}

export const registerEmailBodyHtml = (lang: MIKLang, vars: RegisterVars): string =>
  markdownEmailTemplate(`registration-submit-${lang}.md`, vars, registerEmailDisclaimer(lang))

export type WelcomeVars = {
  firstName: string
}

export const membershipApprovedEmailSubject = (lang: string | undefined): string => {
  switch (lang) {
    case 'fi':
      return 'Tervetuloa Malmin ilmailukerhoon'
    case 'sv':
      return 'MIK - ditt medlemskap är godkänt'
    default:
      return 'MIK - your membership is approved'
  }
}

export const membershipApprovedEmailBodyHtml = (
  lang: string | undefined,
  vars: WelcomeVars,
): string => markdownEmailTemplate(`registration-approved-${lang}.md`, { ...vars, MIK_RULES_URL })
