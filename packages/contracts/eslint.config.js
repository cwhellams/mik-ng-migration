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
  { ignores: ['node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
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
