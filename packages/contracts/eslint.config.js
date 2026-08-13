import js from '@eslint/js'
import tseslint from 'typescript-eslint'

// Server-only modules. The tsconfig already blocks Node globals by omitting
// @types/node, but nothing stops `import fs from 'node:fs'` from typechecking
// against a transitively-installed type, so the boundary is also a lint error.
const SERVER_ONLY = [
  'express',
  'kysely',
  'pg',
  'dotenv',
  'multer',
  'nodemailer',
  'winston',
  'jsonwebtoken',
  'node-cron',
  'handlebars',
]

export default tseslint.config(
  { ignores: ['node_modules', 'coverage'] },
  {
    // The same no-Node-globals rule tsconfig.json enforces by omitting @types/node,
    // repeated here on purpose. The tsconfig version is only as strong as the
    // program's ambient types, and merely adding the test files to that program was
    // enough to disable it once. This one holds regardless.
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...['process', 'Buffer', '__dirname', '__filename', 'global'].map((name) => ({
          name,
          message: `${name} does not exist in the browser. Take it as a parameter from the backend instead — see createExpenseClaimSchema(maxMileageKm).`,
        })),
      ],
    },
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        // ignoreRestSiblings allows the `const { dropped: _dropped, ...rest }`
        // idiom for building a payload with a field deliberately absent.
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*', '../*/src/*', '@backend/*'],
              message:
                'packages/contracts must stay isomorphic — no Node builtins and no reaching into an app.',
            },
          ],
          paths: SERVER_ONLY.map((name) => ({
            name,
            message: `${name} is server-only and cannot be imported from packages/contracts.`,
          })),
        },
      ],
    },
  },
)
