<script setup lang="ts">
// Регистрация service worker (задача 31). Явным кодом, а не плагином модуля
// @vite-pwa/nuxt (`pwa.client.registerPlugin: false` в nuxt.config.ts): его
// плагин уходит через виртуальный модуль `virtual:pwa-register/vue`, который
// не резолвится в тестовом Vite-инстансе @nuxt/test-utils и ломает
// `mountSuspended` в каждом компонентном тесте, а не только в этом. Здесь же,
// в app.vue, компонентные тесты (`mountSuspended(SomeComponent)`) этот код не
// подхватывают — они монтируют сам компонент, а не app.vue.
//
// Только в собранной статике (import.meta.env.PROD): в dev SW выключен
// целиком (`pwa.devOptions.enabled: false`), путь `/sw.js` там 404-ит, и
// регистрация ничего не даст, кроме лишнего запроса.
onMounted(() => {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

  navigator.serviceWorker.register('/sw.js').catch(() => {
    // Не удалось зарегистрировать SW — оболочка при следующих заходах не
    // предкешируется, но остальная работа приложения (вход, API) не зависит
    // от него никак, поэтому это не повод показывать ошибку.
  })
})
</script>

<template>
  <div>
    <NuxtRouteAnnouncer />
    <NuxtPage />
    <InstallPrompt />
  </div>
</template>
