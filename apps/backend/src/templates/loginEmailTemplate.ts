import 'dotenv/config'
import { markdownEmailTemplate } from './emailTemplate.ts'
import { MIKLang } from '../routes/members/models.ts'

export type LoginVars = {
  href: string
  code: number
  firstName: string
}

export const loginEmailTitle = (lang: string | undefined): string =>
  lang == 'fi' ? 'Kirjaudu MIK sivustolle' : 'Confirm your login to MIK Intranet'

export const loginEmailBodyHtml = (lang: MIKLang, vars: LoginVars): string =>
  markdownEmailTemplate(
    `login-${lang}.md`,
    vars,
    lang == MIKLang.FI
      ? 'Jos et pyytänyt tätä sähköpostia, voit huoletta sivuuttaa sen.'
      : 'If you didn’t request this email, you can safely ignore it.',
  )
