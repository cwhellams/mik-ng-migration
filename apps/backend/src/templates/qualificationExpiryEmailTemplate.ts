import { MIKLang } from '@mik/contracts/members'

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

// The email subjects and bodies live in the template registry
// (`qualification-expiry-reminder` / `qualification-expired`). What stays here
// is what the registry can't express: the qualification label table, and the
// one-line mailbox variants, which are plain text rather than markdown emails.

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
