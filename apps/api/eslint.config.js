import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.worker,
    },
  },
  {
    // tsconfig.json has to include @types/node for `node:async_hooks`, so
    // unlike packages/ui and apps/edge it cannot double as the guard. This rule
    // is the only thing standing between a ported module and a `process.env`
    // read that typechecks, bundles, and is undefined at runtime.
    files: ['src/**/*.ts'],
    ignores: ['src/**/*.test.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...['process', 'Buffer', '__dirname', '__filename', 'global'].map((name) => ({
          name,
          message: `${name} does not exist on workerd. Read configuration through getEnv() from src/context.ts.`,
        })),
      ],
    },
  },
)
