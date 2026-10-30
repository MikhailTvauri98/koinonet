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
import { chatTarget, notificationOptions, pickWindow, safePath, shouldShow } from './sw/handlers'
import type { PushPayload } from './sw/handlers'

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

// Never retain presence: workers restart and client sessions/routes change.
// Each push owns fresh ports and a single deadline; errors always show it.
async function visibleChatUrls(payload: PushPayload): Promise<string[]> {
  const origin = self.location.origin
  const chatId = chatTarget(payload, origin)
  if (!chatId) return []
  try {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    return (await Promise.all(windows.filter(client => client.visibilityState === 'visible' && safePath(client.url, origin) !== null).map(client => new Promise<string>((resolve) => {
      const channel = new MessageChannel()
      let settled = false
      const finish = (url = '') => {
        if (settled) return
        settled = true; clearTimeout(timer); channel.port1.close(); channel.port2.close(); resolve(url)
      }
      const timer = setTimeout(() => finish(), 1000)
      channel.port1.onmessage = async (event) => {
        if (event.data?.chatId !== chatId || event.data?.url !== client.url) { finish(); return }
        try {
          const current = await self.clients.get(client.id)
          finish(current?.type === 'window' && (current as WindowClient).visibilityState === 'visible' && current.url === event.data.url ? `/chats/${chatId}` : '')
        } catch { finish() }
      }
      channel.port1.onmessageerror = () => finish()
      try { client.postMessage({ type: 'chat-push-query', chatId }, [channel.port2]) } catch { finish() }
    })))).filter(Boolean)
  } catch { return [] }
}

self.addEventListener('push', (event) => {
  let payload: PushPayload = {}
  try { payload = event.data?.json() ?? {} } catch { /* Пустой/повреждённый JSON: стандартное уведомление. */ }
  event.waitUntil((async () => {
    const open = await visibleChatUrls(payload)
    if (!shouldShow(payload, open, self.location.origin)) return
    const { title, ...options } = notificationOptions(payload)
    await self.registration.showNotification(title, options)
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = safePath(event.notification.data?.url ?? '/', self.location.origin) ?? '/'
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
