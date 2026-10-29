/// <reference lib="webworker" />

// Собственный service worker через injectManifest (nuxt.config.ts, ключ
// `pwa`): фаза 1 только предкеширует оболочку — собранные JS/CSS/HTML,
// манифест и иконки. Список файлов подставляет сборка вместо
// `self.__WB_MANIFEST` ниже.
//
// Запросы к API не кешируются и офлайн-режима нет (docs/architecture.md,
// раздел 10): навигационный fallback на оболочку явно не должен подменять
// собой ответы `/api/` (это префикс и для `/api/v1/media/...` — подписанных,
// с истекающим сроком ссылок на медиафайлы, отдельного правила для них не
// нужно), `/sanctum/` (оттуда выдаётся CSRF-cookie) и `/_protected/`
// (внутренний путь nginx на медиатом, наружу не должен быть виден вовсе, но
// исключён и здесь на случай прямого перехода). Закешированный `/auth/me`
// показал бы вышедшему человеку чужой интерфейс, а закешированная подписанная
// ссылка на медиафайл — истёкшую.
//
// Пуши и переход по ним работают независимо от предкеша оболочки.

import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { notificationOptions, pickWindow } from './sw/handlers'

declare let self: ServiceWorkerGlobalScope

self.skipWaiting()
clientsClaim()
cleanupOutdatedCaches()

precacheAndRoute(self.__WB_MANIFEST)

const EXCLUDED_FROM_SHELL: RegExp[] = [
  /^\/api\//,
  /^\/sanctum\//,
  /^\/_protected\//,
]

// Ключ '/' — не угадан, а взят из собранного манифеста предкеша: сборка
// (`injectManifest`) кладёт корневой `index.html` под ключом '/', а не
// '/index.html' (так же вложенные `login/index.html`, `admin/settings/
// index.html` и т.д. становятся ключами 'login', 'admin/settings' — без
// 'index.html' на конце и без ведущего слеша). '/index.html' в манифесте нет
// вовсе, а `createHandlerBoundToURL` для отсутствующего ключа не откладывает
// ошибку до первого запроса — она бросается синхронно прямо здесь, на
// верхнем уровне модуля, до регистрации install/fetch, и валит весь service
// worker целиком (см. отчёт задачи 31: воспроизведено `scripts/verify-sw.mjs`
// и в песочнице Node). '/' — тот же самый файл, что nginx отдаёт как
// запасной документ для SPA (`docs/architecture.md`, раздел 11: `try_files …
// /index.html`), только под другим именем ключа в манифесте.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/'), {
    denylist: EXCLUDED_FROM_SHELL,
  }),
)

self.addEventListener('push', (event) => {
  let payload = {}
  try { payload = event.data?.json() ?? {} } catch { /* Пустой/повреждённый JSON: стандартное уведомление. */ }
  const { title, ...options } = notificationOptions(payload)
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url: string = event.notification.data?.url ?? '/'
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = pickWindow(windows, url)
    if (existing) {
      await existing.navigate(url)
      return existing.focus()
    }
    return self.clients.openWindow(url)
  })())
})
