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
    debug: process.env.NODE_ENV === 'development',
    // Available languages
    resources: {
      en: { translation: enTranslation },
      fi: { translation: fiTranslation },
      sv: { translation: svTranslation },
    },
    // Common namespace
    defaultNS: 'translation',
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
