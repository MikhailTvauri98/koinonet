import { defineConfig, devices } from '@playwright/test'
import { e2e } from './e2e/environment'

// Сквозные сценарии: `npm run e2e`. Окружение (база, адреса, способ запуска
// API локально и в CI) описано в e2e/environment.ts, подготовка API — в
// e2e/global-setup.ts.
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  globalSetup: './e2e/global-setup.ts',
  // Сценарии идут по очереди против одного API на встроенном сервере PHP.
  workers: 1,
  // Упавший шаг — дефект, а не повод повторить: повторы спрятали бы
  // нестабильность.
  retries: 0,
  // Забытый test.only молча выключил бы остальные сценарии.
  forbidOnly: true,
  timeout: 120_000,
  // Верхний предел всего прогона, включая подготовку API и сборку клиента
  // (восемь сценариев с двумя чатами по замерам занимают около 15 минут).
  // Запас относится ко всему набору: лимиты отдельных шагов и retries=0
  // сохраняются. Разовые команды подготовки ограничены global-setup.ts.
  globalTimeout: 20 * 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  outputDir: './test-results',
  use: {
    ...devices['Desktop Chrome'],
    // Optional local browser already installed on the workstation; CI keeps Chromium.
    ...(process.env.E2E_BROWSER_CHANNEL ? { channel: process.env.E2E_BROWSER_CHANNEL } : {}),
    baseURL: e2e.webOrigin,
    testIdAttribute: 'data-test',
    // Без предела действие ждало бы до таймаута всего теста: недоступный
    // элемент падал бы через две минуты вместо пятнадцати секунд.
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    // Service worker проверяется отдельно на статике (`npm run verify-sw`);
    // здесь он только вмешивался бы в навигацию предпросмотра.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium' }],
  // Один источник: /app проксируется в Reverb, HTTP в отдельный preview.
  // Его routeRules передают /api, /sanctum и /broadcasting в API; цель
  // вшивается при сборке, поэтому сборка — часть запуска.
  webServer: {
    command: `npm run build && node e2e/web-server.mjs ${e2e.webPort} ${e2e.previewPort} ${e2e.reverbPort}`,
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
