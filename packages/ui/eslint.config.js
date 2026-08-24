import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

// i18n.ts turns i18next's HTML escaping off, because React escapes at render
// time and double-escaping printed entities on screen (issue #1255). That is
// only safe while no translated string reaches an HTML sink, so the sinks are
// restricted rather than left to reviewer memory.
//
// MarkdownContent is the one sanctioned sink — it takes server-rendered `*Html`
// fields (DTO syllabus, fuel prices) and never a `t()` result, and its test
// pins that contract. Anything else that needs markup should compose JSX.
const noHtmlSink = {
  selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
  message:
    'dangerouslySetInnerHTML is restricted: i18next interpolation is unescaped (see packages/ui/src/i18n.ts, issue #1255), so feeding a translated string to an HTML sink would be an XSS hole. Compose JSX instead, or route sanitised server HTML through MarkdownContent.',
}

export default tseslint.config(
  { ignores: ['node_modules', 'coverage'] },
  {
    files: ['**/*.{ts,tsx}'],
    ignores: ['src/components/MarkdownContent.tsx'],
    rules: {
      'no-restricted-syntax': ['error', noHtmlSink],
    },
  },
  {
    // The same no-Node-globals rule tsconfig.json enforces by omitting
    // @types/node, repeated here so it holds regardless of which ambient types
    // happen to be in the program. This package is bundled into two browser
    // apps; `process` and `Buffer` do not exist there.
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...['process', 'Buffer', '__dirname', '__filename', 'global'].map((name) => ({
          name,
          message: `${name} does not exist in the browser. Use import.meta.env, or take it as a prop from the app.`,
        })),
      ],
    },
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Downgraded to match apps/frontend and apps/admin, which set the same
      // five newer react-hooks rules to 'warn'. Everything here arrived from
      // apps/frontend unchanged, so promoting them to errors on the way in
      // would mean rewriting working components in a move commit — and would
      // hold this package to a stricter bar than the code it is shared with.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/refs': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              // A shared package that reaches back into an app is not shared.
              // If a component needs something from apps/frontend, either move
              // that too or make it a prop.
              group: ['node:*', '../*/src/*', '@backend/*', '@/*'],
              message:
                '@mik/ui is shared by both apps — it must not reach into either one, and must not use Node builtins.',
            },
          ],
        },
      ],
    },
  },
)
