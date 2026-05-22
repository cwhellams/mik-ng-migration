import { MIKLang } from '../routes/members/models.ts'
import { markdownEmailTemplate } from './emailTemplate.ts'

export type JuniorPromotionEmailVars = {
  firstName: string
}

export const juniorPromotionEmailSubject = (lang: string | undefined): string => {
  switch (lang) {
    case MIKLang.FI:
      return 'MIK - Tervetuloa täysjäseneksi!'
    case MIKLang.SV:
      return 'MIK - Välkommen som fullständig medlem!'
    default:
      return 'MIK - Welcome to Full Membership!'
  }
}

export const juniorPromotionEmailBodyHtml = (
  lang: MIKLang,
  vars: JuniorPromotionEmailVars,
): string => {
  const template = `junior-promotion-${lang}.md`
  return markdownEmailTemplate(template, vars)
}
