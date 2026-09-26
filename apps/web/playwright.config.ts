import { defineConfig, devices } from '@playwright/test'
import { e2e } from './e2e/environment'

// Сквозные сценарии: `npm run e2e`. Окружение (база, адреса, способ запуска
// API локально и в CI) описано в e2e/environment.ts, подготовка API — в
// e2e/global-setup.ts.
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  // Сценарии идут по очереди против одного API на встроенном сервере PHP.
  workers: 1,
  // Упавший шаг — дефект, а не повод повторить: повторы спрятали бы
  // нестабильность.
  retries: 0,
  // Забытый test.only молча выключил бы остальные сценарии.
  forbidOnly: true,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  outputDir: './test-results',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: e2e.webOrigin,
    testIdAttribute: 'data-test',
    // Service worker проверяется отдельно на статике (`npm run verify-sw`);
    // здесь он только вмешивался бы в навигацию предпросмотра.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium' }],
  // Клиент как в проде ходит на свой же источник; /api и /sanctum
  // проксирует сервер предпросмотра Nuxt (routeRules в nuxt.config.ts). Адрес
  // прокси вшивается при сборке, поэтому сборка — часть запуска.
  webServer: {
    command: `npm run build && npm run preview -- --port=${e2e.webPort}`,
    cwd: e2e.webDir,
    url: e2e.webOrigin,
    env: {
      NUXT_API_PROXY_TARGET: e2e.apiOrigin,
      NITRO_HOST: '127.0.0.1',
    },
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
