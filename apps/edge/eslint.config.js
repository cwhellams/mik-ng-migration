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
    // workerd has no Node globals. tsconfig.json enforces this by omitting
    // @types/node; repeat it here so it holds whatever ambient types are in
    // the program.
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...['process', 'Buffer', '__dirname', '__filename', 'global'].map((name) => ({
          name,
          message: `${name} does not exist on workerd. Read configuration from the Env binding instead.`,
        })),
      ],
    },
  },
)
