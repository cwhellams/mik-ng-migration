import 'dotenv/config'
import { markdownEmailTemplate } from './emailTemplate.ts'
import { MIKLang } from '../routes/members/models.ts'

const MIK_RULES_URL = process.env.MIK_RULES_URL ?? 'https://www.mik.fi/about'

export type RegisterVars = {
  firstName: string
  href: string
  code: number
}

export const registerEmailTitle = (lang: string | undefined): string =>
  lang == 'fi' ? 'Tervetuloa Malmin ilmailukerhoon' : 'Welcome to Malmin Ilmailukerho'

export const registerEmailBodyHtml = (lang: MIKLang, vars: RegisterVars): string =>
  markdownEmailTemplate(
    `registration-submit-${lang}.md`,
    vars,
    lang == MIKLang.FI
      ? 'Jos et pyytänyt tätä sähköpostia, voit huoletta sivuuttaa sen.'
      : 'If you didn’t request this email, you can safely ignore it.',
  )

export type WelcomeVars = {
  firstName: string
}

export const membershipApprovedEmailSubject = (lang: string | undefined): string =>
  lang == 'fi' ? 'Tervetuloa Malmin ilmailukerhoon' : 'MIK - your membership is approved'

export const membershipApprovedEmailBodyHtml = (
  lang: string | undefined,
  vars: WelcomeVars,
): string => markdownEmailTemplate(`registration-approved-${lang}.md`, { ...vars, MIK_RULES_URL })
