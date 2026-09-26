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
// Фаза 2 добавит сюда обработчики `push` и `notificationclick` (раздел 10
// архитектуры, ADR-0001).

import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

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

registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: EXCLUDED_FROM_SHELL,
  }),
)
