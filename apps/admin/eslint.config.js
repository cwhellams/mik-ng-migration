import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

// @mik/ui's i18n turns i18next's HTML escaping off, because React escapes at
// render time and double-escaping printed entities on screen (issue #1255).
// That is only safe while no translated string reaches an HTML sink. This app
// has no such sink today; the rule is what keeps it that way. Sanitised server
// HTML goes through @mik/ui's MarkdownContent, the one sanctioned exemption.
const noHtmlSink = {
  selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
  message:
    'dangerouslySetInnerHTML is restricted: i18next interpolation is unescaped (see packages/ui/src/i18n.ts, issue #1255), so feeding a translated string to an HTML sink would be an XSS hole. Compose JSX instead, or route sanitised server HTML through MarkdownContent.',
}

export default tseslint.config(
  { ignores: ['dist'] },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', noHtmlSink],
    },
  },
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
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/refs': 'warn',
      'preserve-caught-error': 'warn',
      'no-useless-assignment': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@backend', '@backend/*', '**/backend/src/**'],
              message:
                'Import shared models and helpers from @mik/contracts/<domain>. The admin app must not reach into apps/backend/src.',
            },
          ],
        },
      ],
    },
  },
)
