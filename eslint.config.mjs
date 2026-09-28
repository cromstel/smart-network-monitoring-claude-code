import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
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
