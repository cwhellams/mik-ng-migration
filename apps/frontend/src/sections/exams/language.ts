import type { ExamVersion } from '@mik/contracts/exams'

export const EXAM_LANGUAGES = ['en', 'fi', 'sv'] as const

export type ExamLanguage = (typeof EXAM_LANGUAGES)[number]

type VersionLanguageConfig = Partial<Pick<ExamVersion, 'defaultLanguage' | 'supportedLanguages'>>

function isExamLanguage(language: string): language is ExamLanguage {
  return EXAM_LANGUAGES.includes(language as ExamLanguage)
}

export function resolveExamUiLanguage(language: string): ExamLanguage {
  if (language.startsWith('fi')) return 'fi'
  if (language.startsWith('sv')) return 'sv'
  return 'en'
}

export function getConfiguredExamLanguages(
  config: VersionLanguageConfig,
  availableLanguages: readonly string[] = [],
): ExamLanguage[] {
  const configuredLanguages = config.supportedLanguages?.filter(isExamLanguage) ?? []
  const fallbackLanguages = [config.defaultLanguage, ...availableLanguages].filter(
    (language): language is ExamLanguage =>
      typeof language === 'string' && isExamLanguage(language),
  )

  return [...new Set([...configuredLanguages, ...fallbackLanguages])]
}

export function getPreferredExamLanguage(
  preferredLanguage: string,
  config: VersionLanguageConfig,
  availableLanguages: readonly string[] = [],
): ExamLanguage | undefined {
  const configuredLanguages = getConfiguredExamLanguages(config, availableLanguages)
  if (configuredLanguages.length === 0) return undefined

  const candidates = [
    resolveExamUiLanguage(preferredLanguage),
    'en',
    config.defaultLanguage,
    ...configuredLanguages,
  ]

  return (
    candidates.find(
      (language): language is ExamLanguage =>
        typeof language === 'string' &&
        isExamLanguage(language) &&
        configuredLanguages.includes(language),
    ) ?? configuredLanguages[0]
  )
}
