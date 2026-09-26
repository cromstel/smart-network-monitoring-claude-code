import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FlatCompat } from '@eslint/eslintrc'

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) })

const config = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      'no-console': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  { files: ['scripts/**', 'e2e/**'], rules: { 'no-console': 'off' } },
  { ignores: ['.next/**', 'node_modules/**', 'coverage/**', 'playwright-report/**', 'next-env.d.ts', '*.config.js'] },
]

export default config
