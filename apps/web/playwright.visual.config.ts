import { defineConfig } from '@playwright/test'

// Реальная CSS-геометрия с ответами API из фикстур; без Docker и БД.
export default defineConfig({
  testDir: './tests/visual',
  testMatch: '**/*.pw.ts',
  workers: 1,
  retries: 0,
  forbidOnly: true,
  // Dev-сервер компилирует страницы по запросу; одна проверка открывает четыре.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: './test-results/visual',
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3020',
    ...(process.env.E2E_BROWSER_CHANNEL ? { channel: process.env.E2E_BROWSER_CHANNEL } : {}),
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host localhost --port 3020',
    url: 'http://localhost:3020',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
