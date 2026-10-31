// Адрес API-контейнера, нужен только для прокси dev-сервера ниже (и для
// сервера предпросмотра сквозных тестов: `nuxt build` вшивает цель прокси в
// его серверную часть, см. playwright.config.ts). Читаем
// process.env напрямую (не через runtimeConfig.public), чтобы адрес не
// попадал в собранный клиентский бандл: в проде и в собранной статике
// dev-прокси не существует, клиент everywhere ходит относительными путями.
const apiProxyTarget = process.env.NUXT_API_PROXY_TARGET || 'http://localhost:8080'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  ssr: false,
  modules: ['@pinia/nuxt', '@nuxt/eslint', '@vite-pwa/nuxt'],
  css: ['~/assets/css/tokens.css', '~/assets/css/base.css'],
  // Топология dev повторяет топологию прода (docs/architecture.md, раздел
  // 10 и 11): SPA и API отдаются с одного источника, клиент ходит
  // относительными путями ('/api/v1/...', '/sanctum/...'). В проде это
  // делает nginx, в dev — сам dev-сервер Nuxt через routeRules-прокси.
  // Благодаря этому браузер во всех окружениях видит единственный источник
  // (localhost:3000 в dev), CORS для cookie-запросов настраивать не нужно,
  // а Origin/Referer запроса совпадает с тем, что уже есть в
  // SANCTUM_STATEFUL_DOMAINS (apps/api/.env.example).
  routeRules: {
    '/api/**': { proxy: `${apiProxyTarget}/api/**` },
    '/sanctum/**': { proxy: `${apiProxyTarget}/sanctum/**` },
    '/broadcasting/**': { proxy: `${apiProxyTarget}/broadcasting/**` },
  },
  nitro: {
    // Нужен Nitro >= 2.13.5 (закреплён в lockfile): 2.13.4 игнорирует ws.
    // devProxy снимает префикс /app, поэтому восстанавливаем его в target.
    devProxy: {
      '/app': { target: `${apiProxyTarget}/app`, ws: true, changeOrigin: true },
    },
  },
  app: {
    head: {
      htmlAttrs: { lang: 'ru' },
      title: 'Церковь',
      // Манифест статичен (public/manifest.webmanifest, задача 31): ниже
      // модуль `pwa` настроен с `manifest: false`, поэтому ссылку и
      // theme-color добавляем сами, а не через автогенерацию модуля.
      link: [
        { rel: 'manifest', href: '/manifest.webmanifest' },
        // Без него iOS Safari берёт для "На экран «Домой»" скриншот страницы
        // вместо иконки — единственная манифестная иконка на это не влияет,
        // apple-touch-icon читается отдельно от манифеста.
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/icons/apple-touch-icon-180x180.png' },
      ],
      meta: [{ name: 'theme-color', content: '#34445a' }],
    },
  },
  // По умолчанию `nuxt typecheck` проверяет только app/, tests/nuxt и tests/unit
  // остаются вне проекта TypeScript. Добавляем tests/, чтобы дымовой тест
  // реально проверялся тайпчеком (иначе `import type` из отсутствующего
  // types/api.d.ts молча стирается транспайлером и не падает).
  typescript: {
    tsConfig: {
      include: ['../tests/**/*'],
    },
    // Сквозные сценарии (задача 32) исполняются в Node, а не в браузерном
    // бандле — им место в проекте TypeScript для Node-файлов рядом с
    // nuxt.config.ts. Playwright сам типы не проверяет, только стирает.
    nodeTsConfig: {
      compilerOptions: { types: ['node'] },
      include: ['../e2e/**/*', '../playwright.config.ts', '../playwright.visual.config.ts'],
    },
  },
  // PWA (задача 31): манифест и иконки статичны в public/ (см. app.head.link
  // выше и public/manifest.webmanifest), поэтому `manifest: false` — модуль
  // не должен генерировать свой и конфликтовать со статикой. Service worker
  // собственный (app/sw.ts) через `injectManifest`: только предкеш оболочки,
  // без офлайн-кеша ответов API (раздел 10 архитектуры, подробности — в
  // комментариях самого sw.ts).
  pwa: {
    strategies: 'injectManifest',
    // Nuxt 4 уже строит клиент с корнем в `app/` (`nuxt.options.srcDir`),
    // поэтому `srcDir` модуля — '.', а не 'app': иначе путь удваивается
    // (`app/app/sw.ts`) и сборка не находит исходник.
    srcDir: '.',
    filename: 'sw.ts',
    manifest: false,
    includeManifestIcons: false,
    injectManifest: {
      // Только сборка оболочки и статика public/: JS/CSS/HTML, манифест и
      // иконки. Данных API среди файлов сборки нет — они не с диска, а
      // приходят с сервера, поэтому отдельно исключать их из глобa не нужно.
      globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
    },
    // Выключено в dev осознанно: dev-сервер и так отдаёт /api/, /sanctum/
    // через свой routeRules-прокси (см. выше) и держит HMR через свой
    // websocket — service worker в dev добавил бы второй, конкурирующий
    // слой перехвата запросов без какой-либо пользы (офлайн не нужен даже в
    // проде). Проверяется собранной статикой после `npm run generate`.
    devOptions: {
      enabled: false,
    },
    client: {
      // Модуль обычно сам регистрирует SW через свой плагин и виртуальный
      // модуль `virtual:pwa-register/vue`. Этот виртуальный модуль не
      // резолвится в тестовом Vite-инстансе @nuxt/test-utils (импорт падает
      // при каждом `mountSuspended`, из любого спека — не только этого),
      // поэтому плагин модуля выключен, а регистрация написана явным кодом
      // без виртуальных модулей в app/app.vue (там она и не мешает тестам
      // компонентов: mountSuspended монтирует сам компонент, а не app.vue).
      registerPlugin: false,
    },
  },
})
