// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  ssr: false,
  modules: ['@pinia/nuxt', '@nuxt/eslint'],
  runtimeConfig: {
    public: { apiBase: process.env.NUXT_PUBLIC_API_BASE || 'http://localhost:8080' },
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
