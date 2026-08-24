import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default tseslint.config(
  { ignores: ['node_modules', 'coverage'] },
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
