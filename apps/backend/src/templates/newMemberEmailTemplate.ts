import 'dotenv/config'
import { markdownEmailTemplate } from './emailTemplate.ts'
import type { MIKLang } from '../routes/members/models.ts'

export type NewMemberVars = {
  firstName: string
  href: string
}

export const newMemberEmailSubject = (lang: MIKLang | string | undefined): string => {
  switch (lang) {
    case 'fi':
      return 'Uusi jäsen rekisteröitynyt'
    case 'sv':
      return 'Ny medlem registrerad'
    default:
      return 'New member registered'
  }
}

const normalizeLang = (lang: MIKLang | string | undefined): 'fi' | 'sv' | 'en' => {
  if (lang === 'fi' || lang === 'sv') return lang
  return 'en'
}

export const newMemberEmailBodyHtml = (
  lang: MIKLang | string | undefined,
  vars: NewMemberVars,
): string => markdownEmailTemplate(`new-member-${normalizeLang(lang)}.md`, vars)
