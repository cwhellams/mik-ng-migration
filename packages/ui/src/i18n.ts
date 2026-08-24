import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

// Import your translation files
import enTranslation from './locales/en.json'
import fiTranslation from './locales/fi.json'
import svTranslation from './locales/sv.json'

i18n
  // Detect user language
  .use(LanguageDetector)
  // Pass the i18n instance to react-i18next
  .use(initReactI18next)
  // Initialize i18next
  .init({
    // Default language
    fallbackLng: 'en',
    // Debug mode in development
    debug: import.meta.env.DEV,
    // Available languages
    resources: {
      en: { translation: enTranslation },
      fi: { translation: fiTranslation },
      sv: { translation: svTranslation },
    },
    supportedLngs: ['en', 'fi', 'sv'],
    // Common namespace
    defaultNS: 'translation',
    // React escapes every string it renders, so i18next must not escape as
    // well. With i18next's default `escapeValue: true`, an interpolated value
    // containing & < > " ' or / reached the screen as its HTML entity — a
    // defect description of `U/S` was printed `U&#x2F;S` (issue #1255).
    // This is react-i18next's documented setting for exactly that reason.
    //
    // The invariant it depends on: no `t()` result is ever fed to an HTML sink.
    // The `dangerouslySetInnerHTML` restriction in this package's and both
    // apps' eslint.config.js pins that; MarkdownContent is the one exemption,
    // and it renders server-rendered `*Html` fields, never a translation.
    interpolation: { escapeValue: false },
    // Caching
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
    // React settings
    react: {
      useSuspense: true,
    },
  })

export default i18n
