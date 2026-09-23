// Адрес API-контейнера, нужен только для прокси dev-сервера ниже. Читаем
// process.env напрямую (не через runtimeConfig.public), чтобы адрес не
// попадал в собранный клиентский бандл: в проде и в собранной статике
// dev-прокси не существует, клиент everywhere ходит относительными путями.
const apiProxyTarget = process.env.NUXT_API_PROXY_TARGET || 'http://localhost:8080'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  ssr: false,
  modules: ['@pinia/nuxt', '@nuxt/eslint'],
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
  },
  app: { head: { htmlAttrs: { lang: 'ru' }, title: 'Церковь' } },
  // По умолчанию `nuxt typecheck` проверяет только app/, tests/nuxt и tests/unit
  // остаются вне проекта TypeScript. Добавляем tests/, чтобы дымовой тест
  // реально проверялся тайпчеком (иначе `import type` из отсутствующего
  // types/api.d.ts молча стирается транспайлером и не падает).
  typescript: {
    tsConfig: {
      include: ['../tests/**/*'],
    },
  },
})
