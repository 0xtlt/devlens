import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      // Storage APIs (sessionStorage, localStorage) can throw — we swallow
      // those failures intentionally, so empty catch blocks are allowed.
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
)
