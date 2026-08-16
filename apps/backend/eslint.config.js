import eslint from '@eslint/js'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import prettierPlugin from 'eslint-plugin-prettier'
import importPlugin from 'eslint-plugin-import'
import promisePlugin from 'eslint-plugin-promise'
import jestPlugin from 'eslint-plugin-jest'
import globals from 'globals'

export default [
  // Apply ESLint recommended rules
  eslint.configs.recommended,

  // Apply TypeScript configurations
  {
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
        project: './tsconfig.json',
      },
      globals: {
        ...globals.jest,
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      prettier: prettierPlugin,
      import: importPlugin,
      promise: promisePlugin,
      jest: jestPlugin,
    },

    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // Base no-redeclare does not understand TypeScript function overloads and reports
      // every signature as a redeclaration. The TS-aware version does.
      'no-redeclare': 'off',
      '@typescript-eslint/no-redeclare': 'error',

      // TypeScript ESLint rules
      '@typescript-eslint/explicit-function-return-type': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
      // General ESLint rules
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // Import rules — never adopted by the codebase (~900 violations), and
      // linting was broken for long enough that nobody saw them. Warn until
      // someone runs `eslint --fix` over it deliberately; see issue #1132.
      'import/order': [
        'warn',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling'], 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],

      // Prettier integration. Deliberately no inline options: these used to
      // duplicate the repo's .prettierrc and contradict it (arrowParens 'avoid'
      // against the real 'always'), so every arrow function was reported as an
      // error that could not be fixed without failing `prettier --check`.
      // With no options the plugin resolves .prettierrc itself, and the two agree.
      'prettier/prettier': 'error',
    },
  },

  // Ignoring specific files and directories
  {
    ignores: ['node_modules/', 'dist/', 'build/', 'coverage/', '**/*.d.ts'],
  },
]
