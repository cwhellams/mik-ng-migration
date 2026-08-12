import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // dev-dist holds the generated PWA service worker; it carries eslint-disable
  // comments for rules this config does not define, which ESLint reports as errors.
  { ignores: ['dist', 'dev-dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // New rules introduced in react-hooks v7 — warn only until codebase is updated
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/immutability': 'warn',
      // Same batch, missed when the others were downgraded because linting was
      // broken at the time and nobody could see it. 30 existing violations, all
      // in ExpenseClaimWizard and MileageDetailFields — see issue #1132.
      'react-hooks/refs': 'warn',
      // New rules introduced in ESLint 10 / @eslint/js v10 — warn only for now
      'preserve-caught-error': 'warn',
      'no-useless-assignment': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // The browser must not be able to import backend source. It used to, via an
      // `@backend/*` path alias into apps/backend/src, which meant nothing stopped a
      // component from pulling in db/connection.ts or dotenv (issue #1115, finding 7).
      // The shared Zod models, Problem shape and isomorphic helpers now live in
      // @mik/contracts; anything else in the backend is server-only by definition.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@backend', '@backend/*', '**/backend/src/**'],
              message:
                'Import shared models and helpers from @mik/contracts/<domain>. The frontend must not reach into apps/backend/src.',
            },
          ],
        },
      ],
    },
  },
)
