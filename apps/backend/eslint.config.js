import eslint from '@eslint/js'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import prettierPlugin from 'eslint-plugin-prettier'
import importPlugin from 'eslint-plugin-import'
import promisePlugin from 'eslint-plugin-promise'
import jestPlugin from 'eslint-plugin-jest'
import js from '@eslint/js'
import globals from 'globals'

export default [
  // Apply ESLint recommended rules
  eslint.configs.recommended,
  js.configs.recommended,

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
      // TypeScript ESLint rules
      '@typescript-eslint/explicit-function-return-type': 'warn',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
      // General ESLint rules
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // Import rules
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling'], 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],

      // Prettier integration
      'prettier/prettier': [
        'error',
        {
          semi: false,
          trailingComma: 'all',
          singleQuote: true,
          printWidth: 100,
          tabWidth: 2,
          arrowParens: 'avoid',
          endOfLine: 'auto',
        },
      ],
    },
  },

  // Ignoring specific files and directories
  {
    ignores: ['node_modules/', 'dist/', 'build/', 'coverage/', '**/*.d.ts'],
  },
]
