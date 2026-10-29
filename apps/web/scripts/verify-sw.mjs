#!/usr/bin/env node
// Проверка задачи 31 (найдена ревью): собранный service worker может не
// бросать заметных для линтера/тайпчекера ошибок и всё равно упасть при
// реальном исполнении. Так и случилось: `createHandlerBoundToURL('/index.html')`
// в app/sw.ts бросал `WorkboxError('non-precached-url')` синхронно, на
// верхнем уровне модуля (внутри `createHandlerBoundToURL`, до регистрации
// install/fetch) — потому что манифест предкеша, который реально собирает
// `injectManifest`, кладёт корневой index.html под ключом '/', а не
// '/index.html'. Ни `grep` по исходнику, ни юнит-тест компонента этого не
// видит: ошибка целиком внутри исполнения собранного файла.
//
// Скрипт запускается после `npm run generate` (см. npm-скрипт `verify-sw`):
// выполняет `.output/public/sw.js` в песочнице Node vm с минимальными
// подделками глобальных объектов service worker и падает, если:
//   1) скрипт бросает исключение при исполнении верхнего уровня;
//   2) обработчик навигаций не зарегистрировался (Workbox добавляет
//      `self.addEventListener('fetch', ...)` синхронно при первом
//      `registerRoute()` — отсутствие такого listener'а значит, что до
//      регистрации дело не дошло);
//   3) навигация на путь, которого нет в предкеше (например, на карточку
//      человека — /people/{id}, страница не пререндерится и в манифесте её
//      нет), не подхватывается оболочкой — то есть именно то место, которое
//      использует исправленный `createHandlerBoundToURL('/')`;
//   4) навигация на /api/, /sanctum/ или /_protected/ ошибочно подхватывается
//      оболочкой — denylist обязан пропустить их мимо service worker.

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createContext, Script } from 'node:vm'
import assert from 'node:assert/strict'

const here = path.dirname(fileURLToPath(import.meta.url))
const swPath = path.resolve(here, '../.output/public/sw.js')

if (!existsSync(swPath)) {
  console.error(`Не найден собранный service worker: ${swPath}`)
  console.error('Сначала выполните "npm run generate" в apps/web.')
  process.exit(1)
}

const source = readFileSync(swPath, 'utf-8')

const ORIGIN = 'https://church.example'

const listeners = new Map()
const shownNotifications = []
const openedWindows = []
let openClients = []
function addEventListener(type, handler) {
  const list = listeners.get(type) ?? []
  list.push(handler)
  listeners.set(type, list)
}

// Кеш ничего реально не хранит: цель скрипта — маршрутизация (какой запрос
// перехватывается, какой нет), а не содержимое кеша. Промис ответа
// обработчика поэтому не ожидается до конца (см. makeNavigationEvent) —
// достаточно того, что Router его создал и передал в `event.respondWith`.
const fakeCache = {
  async match() { return undefined },
  async put() {},
  async delete() { return false },
  async keys() { return [] },
}

const sandbox = {
  console,
  location: { href: `${ORIGIN}/sw.js`, origin: ORIGIN },
  registration: {
    scope: `${ORIGIN}/`,
    async showNotification(title, options) { shownNotifications.push({ title, options }) },
  },
  addEventListener,
  skipWaiting() {},
  clients: {
    claim: async () => {},
    matchAll: async () => openClients,
    async openWindow(url) { openedWindows.push(url) },
  },
  caches: {
    async open() { return fakeCache },
    async has() { return false },
    async keys() { return [] },
    async delete() { return false },
  },
  fetch: async () => {
    throw new Error('сеть недоступна в песочнице проверки — это ожидаемо')
  },
  URL,
  Headers,
  importScripts() {},
}
sandbox.self = sandbox
sandbox.globalThis = sandbox

const context = createContext(sandbox)

let thrown = null
try {
  new Script(source, { filename: 'sw.js' }).runInContext(context)
}
catch (error) {
  thrown = error
}

function fail(message, error) {
  console.error(`FAIL: ${message}`)
  if (error) console.error(error)
  process.exit(1)
}

if (thrown) {
  fail('service worker бросил исключение при исполнении верхнего уровня.', thrown)
}

const fetchListeners = listeners.get('fetch') ?? []
if (fetchListeners.length === 0) {
  fail('обработчик навигаций не зарегистрирован — ни один fetch-listener не появился (registerRoute не был вызван успешно).')
}

// Фиктивный FetchEvent: `request` — обычный объект (не настоящий Request),
// потому что спецификация Fetch запрещает создавать Request с mode:
// 'navigate' через конструктор ("invalid request mode navigate" — проверено
// эмпирически что в Node, что в браузерах), а именно `mode: 'navigate'`
// проверяет NavigationRoute. Продакшен-сборка (process.env.NODE_ENV ===
// 'production' при `nuxt generate`) вырезает единственную dev-проверку
// `assert.isInstance(request, Request, ...)`, поэтому обычного объекта с
// нужными полями достаточно — то же самое видно и в собранном sw.js:
// вызовов assert там нет.
function makeNavigationEvent(url) {
  const request = { url, mode: 'navigate', method: 'GET', headers: new Headers() }
  let responded = false
  const event = {
    request,
    respondWith(promise) {
      responded = true
      // Реального Cache Storage в песочнице нет, поэтому промис не
      // ожидается: важно только то, что Router нашёл маршрут и вызвал
      // `respondWith` — то есть что запрос вообще перехвачен. Отклонённый
      // промис не должен ронять процесс необработанным исключением.
      promise.catch(() => {})
    },
    waitUntil() {},
  }
  for (const listener of fetchListeners) listener(event)
  return responded
}

// (3) Путь, которого нет в предкеше (динамическая карточка человека — такие
// страницы не пререндерятся и в манифесте отсутствуют): должен дойти до
// NavigationRoute и подхватиться исправленным `createHandlerBoundToURL('/')`.
const shellUrl = `${ORIGIN}/people/01K5ZK5ZK5ZK5ZK5ZK5ZK5ZK5Z`
if (!makeNavigationEvent(shellUrl)) {
  fail(`навигация на ${shellUrl} не подхвачена оболочкой — обработчик навигаций не сработал (проверьте ключ в createHandlerBoundToURL).`)
}

// (4) Пути API/CSRF/внутреннего alias'а nginx не должны подменяться оболочкой.
const blockedUrls = [
  `${ORIGIN}/api/v1/auth/me`,
  `${ORIGIN}/api/v1/media/01K5ZK5ZK5ZK5ZK5ZK5ZK5ZK5Z?signature=x`,
  `${ORIGIN}/sanctum/csrf-cookie`,
  `${ORIGIN}/_protected/some/path.jpg`,
]
for (const blockedUrl of blockedUrls) {
  if (makeNavigationEvent(blockedUrl)) {
    fail(`навигация на ${blockedUrl} перехвачена оболочкой — denylist не сработал.`)
  }
}

console.log('OK: service worker выполняется без исключений верхнего уровня, обработчик навигаций зарегистрирован, подхватывает не-предкешированные пути и не трогает /api/, /sanctum/, /_protected/.')

// Проверяем исполняемые обработчики именно из production sw.js, а не наличие
// строк в исходнике. Разрешение и внешний push-сервис здесь не используются.
async function dispatch(type, event) {
  const handlers = listeners.get(type) ?? []
  assert.ok(handlers.length > 0, `Обработчик ${type} не зарегистрирован`)
  const pending = []
  for (const handler of handlers) handler({ ...event, waitUntil: promise => pending.push(promise) })
  await Promise.all(pending)
}

const target = '/announcements/01K5ZK5ZK5ZK5ZK5ZK5ZK5ZK5Z'
await dispatch('push', { data: { json: () => ({ title: 'Собрание', body: 'В 10:00', icon: '/icons/icon-192.png', tag: 'announcement-a1', url: target }) } })
assert.equal(shownNotifications[0].title, 'Собрание')
assert.equal(shownNotifications[0].options.body, 'В 10:00')
assert.equal(shownNotifications[0].options.icon, '/icons/icon-192.png')
assert.equal(shownNotifications[0].options.tag, 'announcement-a1')
assert.equal(shownNotifications[0].options.data.url, target)
assert.equal(shownNotifications[0].options.renotify, true)
assert.ok(existsSync(path.resolve(here, '../.output/public/icons/icon-192.png')), 'Иконка пушей отсутствует в статике')

await dispatch('push', { data: { json() { throw new Error('invalid JSON') } } })
assert.equal(shownNotifications[1].title, 'Церковь')
assert.equal(shownNotifications[1].options.data.url, '/')
assert.equal(shownNotifications[1].options.renotify, false)

const actions = []
openClients = [{ url: `${ORIGIN}/people`, async navigate(url) { actions.push(['navigate', url]) }, async focus() { actions.push(['focus']) } }]
await dispatch('notificationclick', { notification: { data: { url: target }, close() { actions.push(['close']) } } })
assert.deepEqual(actions, [['close'], ['navigate', target], ['focus']])
assert.equal(openedWindows.length, 0)

openClients = []
await dispatch('notificationclick', { notification: { data: { url: target }, close() {} } })
assert.deepEqual(openedWindows, [target])
console.log('OK: production push показывает title/body/icon/tag, переносит url в data.url; notificationclick закрывает карточку, ожидает navigate перед focus или открывает нужный маршрут.')
