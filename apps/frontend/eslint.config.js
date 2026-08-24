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
  // API paths belong in src/api/endpoints.ts, not at the call site (#1115 §6, and
  // Q8 in that issue, which asked for the guardrail rather than just the cleanup).
  //
  // `MIGRATED_DOMAINS` is the enforcement, and it is deliberately a list of
  // domains rather than of directories: the literals are spread across
  // src/sections by page, not by domain, so there is no directory to point at.
  // A domain in here can never regain a raw literal; the ~37 domains not in here
  // yet are untouched, and each gets added as its call sites move over. When the
  // list covers everything it collapses to a plain `^v1/`.
  //
  // Tests are exempt: an MSW handler asserting `apiUrl('v1/members/:memberId')`
  // is stating the wire path on purpose, and routing it through the registry
  // would make the test agree with the code by construction rather than check it.
  {
    files: ['**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}', 'src/test/**', 'src/api/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        // Flat config replaces a rule's options rather than merging them, so the
        // HTML-sink restriction has to ride along in this array to survive.
        noHtmlSink,
        {
          selector: 'Literal[value=/^v1\\u002F(members|aircrafts|bookings)(\\u002F|$)/]',
          message:
            'Use the path from src/api/endpoints.ts (e.g. endpoints.members.byId(id)) instead of a raw API path. Defining it once keeps renames to one edit and keeps SWR cache keys in step with the URL that was fetched.',
        },
        {
          selector: 'TemplateElement[value.raw=/^v1\\u002F(members|aircrafts|bookings)\\u002F/]',
          message:
            'Use the path builder from src/api/endpoints.ts (e.g. endpoints.members.byId(id)) instead of interpolating an API path.',
        },
      ],
    },
  },
  // The block above exempts tests, src/test and src/api from the API-path rules,
  // for the reason given there. The HTML-sink restriction has no such reason, so
  // restate it for exactly those files rather than leaving them uncovered.
  {
    files: ['**/*.test.{ts,tsx}', 'src/test/**', 'src/api/**'],
    rules: {
      'no-restricted-syntax': ['error', noHtmlSink],
    },
  },
)
