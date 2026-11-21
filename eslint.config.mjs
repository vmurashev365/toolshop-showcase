import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import playwright from 'eslint-plugin-playwright';

export default defineConfig([
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: { '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: false }] },
  },
  {
    files: ['tests/unit/**/*.test.ts'],
    rules: {
      // node:test owns the promise returned when each top-level test registers.
      '@typescript-eslint/no-floating-promises': [
        'error',
        {
          ignoreVoid: false,
          allowForKnownSafeCalls: [{ from: 'package', package: '@types/node', name: 'test' }],
        },
      ],
    },
  },
  {
    files: ['tests/pw/**/*.spec.ts'],
    plugins: { playwright },
    rules: {
      'playwright/missing-playwright-await': 'error',
      'playwright/no-focused-test': 'error',
      'playwright/no-wait-for-timeout': 'error',
      'playwright/prefer-web-first-assertions': 'error',
    },
  },
]);
