import { MIKLang } from '../routes/members/models.ts'
import { markdownEmailTemplate } from './emailTemplate.ts'

const TRAINING_EMAIL = 'koulutus@mik.fi'

const QUALIFICATION_LABELS: Record<string, Record<string, string>> = {
  fiExpiry: { en: 'Flight Instructor (FI)', fi: 'Lentokouluttaja (FI)', sv: 'Flyginstruktör (FI)' },
  iriExpiry: {
    en: 'Instrument Rating Instructor (IRI)',
    fi: 'Mittarilentokouluttaja (IRI)',
    sv: 'Instrumentratinginstruktör (IRI)',
  },
  criExpiry: {
    en: 'Class Rating Instructor (CRI)',
    fi: 'Luokkakelpuutuskouluttaja (CRI)',
    sv: 'Klassbehörighetsinstruktör (CRI)',
  },
  sepExpiry: { en: 'SEP(land)', fi: 'SEP(land)', sv: 'SEP(land)' },
  medicalClass1Expiry: {
    en: 'Medical Class I',
    fi: 'Lääketieteellinentodistus luokka 1',
    sv: 'Medicinskt klass 1',
  },
  medicalClass2Expiry: {
    en: 'Medical Class II',
    fi: 'Lääketieteellinentodistus luokka 2',
    sv: 'Medicinskt klass 2',
  },
  medicalLaplExpiry: {
    en: 'Medical LAPL',
    fi: 'Lääketieteellinentodistus LAPL',
    sv: 'Medicinskt LAPL',
  },
}

function getQualificationLabel(field: string, lang: string | undefined): string {
  const labels = QUALIFICATION_LABELS[field]
  if (!labels) return field
  if (lang === MIKLang.FI) return labels.fi
  if (lang === MIKLang.SV) return labels.sv
  return labels.en
}

export type QualificationExpiryEmailVars = {
  firstName: string
  qualificationLabel: string
  expiryDate: string
  daysUntilExpiry?: number
}

export function qualificationExpiryReminderSubject(lang: string | undefined): string {
  switch (lang) {
    case MIKLang.FI:
      return 'MIK - Pätevyyden vanhentumismuistutus'
    case MIKLang.SV:
      return 'MIK - Påminnelse om kvalifikationsutgång'
    default:
      return 'MIK - Qualification Expiry Reminder'
  }
}

export function qualificationExpiryReminderBodyHtml(
  lang: string | undefined,
  vars: QualificationExpiryEmailVars,
): string {
  const locale = lang === MIKLang.FI ? 'fi' : lang === MIKLang.SV ? 'sv' : 'en'
  return markdownEmailTemplate(`qualification-expiry-reminder-${locale}.md`, {
    ...vars,
    TRAINING_EMAIL,
  })
}

export function qualificationExpiredSubject(lang: string | undefined): string {
  switch (lang) {
    case MIKLang.FI:
      return 'MIK - Pätevyys vanhentunut'
    case MIKLang.SV:
      return 'MIK - Kvalifikation har upphört'
    default:
      return 'MIK - Qualification Expired'
  }
}

export function qualificationExpiredBodyHtml(
  lang: string | undefined,
  vars: QualificationExpiryEmailVars,
): string {
  const locale = lang === MIKLang.FI ? 'fi' : lang === MIKLang.SV ? 'sv' : 'en'
  return markdownEmailTemplate(`qualification-expired-${locale}.md`, {
    ...vars,
    TRAINING_EMAIL,
  })
}

export function qualificationExpiryReminderMailboxBody(
  lang: string | undefined,
  vars: QualificationExpiryEmailVars,
): string {
  switch (lang) {
    case MIKLang.FI:
      return `${vars.qualificationLabel} vanhenee ${vars.expiryDate} (${vars.daysUntilExpiry} päivän kuluttua).`
    case MIKLang.SV:
      return `${vars.qualificationLabel} upphör ${vars.expiryDate} (om ${vars.daysUntilExpiry} dagar).`
    default:
      return `${vars.qualificationLabel} expires on ${vars.expiryDate} (in ${vars.daysUntilExpiry} days).`
  }
}

export function qualificationExpiredMailboxBody(
  lang: string | undefined,
  vars: QualificationExpiryEmailVars,
): string {
  switch (lang) {
    case MIKLang.FI:
      return `${vars.qualificationLabel} vanhentui ${vars.expiryDate}.`
    case MIKLang.SV:
      return `${vars.qualificationLabel} upphörde ${vars.expiryDate}.`
    default:
      return `${vars.qualificationLabel} expired on ${vars.expiryDate}.`
  }
}

export function buildQualificationEmailVars(
  firstName: string,
  field: string,
  expiryDate: string,
  lang: string | undefined,
  daysUntilExpiry?: number,
): QualificationExpiryEmailVars {
  return {
    firstName,
    qualificationLabel: getQualificationLabel(field, lang),
    expiryDate,
    daysUntilExpiry,
  }
}

export { TRAINING_EMAIL }
