import { configDefaults } from 'vitest/config'
import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    environment: 'happy-dom',
    // e2e/*.spec.ts — сценарии Playwright (`npm run e2e`), не Vitest.
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
