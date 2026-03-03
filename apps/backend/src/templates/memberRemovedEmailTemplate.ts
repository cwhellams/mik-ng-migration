import { markdownEmailTemplate } from './emailTemplate.ts'
import { MIKLang } from '../routes/members/models.ts'

export type MemberRemovedVars = {
  firstName: string
}

export const memberRemovedEmailSubject = (lang: MIKLang): string => {
  switch (lang) {
    case MIKLang.FI:
      return 'Jäsenyytesi on päättynyt - Malmin Ilmailukerho'
    case MIKLang.SV:
      return 'Ditt medlemskap har upphört - Malmin Ilmailukerho'
    default:
      return 'Your membership has been terminated - Malmin Ilmailukerho'
  }
}

export const memberRemovedEmailBodyHtml = (lang: MIKLang, vars: MemberRemovedVars): string =>
  markdownEmailTemplate(`member-removed-${lang}.md`, vars)

export type DtoStudentRemovedVars = {
  firstName: string
  lastName: string
  memberId: string
}

export const dtoStudentRemovedEmailSubject = (lang: MIKLang): string => {
  switch (lang) {
    case MIKLang.FI:
      return 'DTO-oppilas poistettu jäsenrekisteristä'
    case MIKLang.SV:
      return 'DTO-student borttagen från medlemsregistret'
    default:
      return 'DTO student removed from member registry'
  }
}

export const dtoStudentRemovedEmailBodyHtml = (
  lang: MIKLang,
  vars: DtoStudentRemovedVars,
): string => markdownEmailTemplate(`dto-student-removed-${lang}.md`, vars)
