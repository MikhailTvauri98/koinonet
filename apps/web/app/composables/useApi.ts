type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
// FormData дополнена ради загрузки файлов (обложка служения, задача 28):
// ofetch отличает её от обычного тела сам (isJSONSerializable в ofetch
// исключает FormData) и не сериализует в JSON, оставляя fetch() самому
// выставить заголовок multipart с границей — CSRF и обработка 401/403 ниже
// от этого не меняются, они читают только путь и метод.
type JsonBody = Record<string, unknown> | FormData
type Query = Record<string, string | number | boolean | null | undefined>

const UNSAFE_METHODS: ReadonlySet<HttpMethod> = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// openapi.json выносит префикс `/api/v1` в servers[0].url, а ключи `paths` идут
// без него ('/auth/login', '/auth/me', ...) — useApi сам подставляет базу здесь,
// в одном месте, а не в каждом вызывающем экране.
const API_BASE = '/api/v1'

// Все запросы идут относительными путями на тот же источник, с которого отдан
// SPA: в dev это прокси Nuxt (nuxt.config.ts routeRules), в проде — nginx
// (docs/architecture.md:614). Так и dev, и прод ходят "к себе", без CORS и без
// адреса API, зашитого в собранный бандл.
function readXsrfToken(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]*)/)
  const raw = match?.[1]
  return raw === undefined ? null : decodeURIComponent(raw)
}

// Каждый запрос явно просит JSON. ofetch сам ставит этот заголовок только
// запросам с JSON-телом, а без него Laravel не считает GET запросом API и
// строит для гостя перенаправление вместо ответа 401 (найдено сквозными
// сценариями задачи 32; сервер теперь отвечает 401 и так, это вторая линия).
const ACCEPT_JSON = { Accept: 'application/json' } as const

async function ensureCsrfCookie(): Promise<void> {
  await $fetch('/sanctum/csrf-cookie', { credentials: 'include', headers: ACCEPT_JSON })
}

export function useApi() {
  const auth = useAuthStore()
  const router = useRouter()

  async function request<T>(method: HttpMethod, path: string, body?: JsonBody, query?: Query): Promise<T> {
    // Only this non-API endpoint may escape the versioned API prefix.
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')
      || (path.startsWith('/broadcasting') && (path !== '/broadcasting/auth' || method !== 'POST'))) {
      throw new Error('Expected a relative API path')
    }
    const url = path === '/broadcasting/auth' ? path : `${API_BASE}${path}`
    // CSRF-cookie запрашивается перед небезопасными методами и только перед
    // ними: безопасные GET не меняют состояние и Sanctum её не требует.
    if (UNSAFE_METHODS.has(method)) {
      await ensureCsrfCookie()
    }

    const headers: Record<string, string> = { ...ACCEPT_JSON }
    const xsrfToken = readXsrfToken()
    if (xsrfToken) {
      headers['X-XSRF-TOKEN'] = xsrfToken
    }

    return await $fetch<T>(url, {
      method,
      credentials: 'include',
      headers,
      body,
      query,
      async onResponseError({ response }) {
        if (response.status === 401 && path !== '/auth/me') {
          // Сессия истекла или её не было: чистим состояние и ведём на вход,
          // а не оставляем пустой экран. /auth/me исключён тем же приёмом,
          // что и ниже у 403: 401 оттуда — не сбой посреди работы, а обычный
          // ответ на вопрос "кто вошёл", который сам обрабатывает fetchMe()
          // (apps/web/app/stores/auth.ts) через reset() в своём catch, а
          // решение, куда вести дальше, принимает middleware
          // (auth.global.ts). Без исключения этот push('/login') конкурировал
          // бы с уже идущей навигацией — например на
          // /login?passwordChanged=1 после сброса пароля
          // (pages/password-reset/[token].vue) — и отменял бы её вместе с
          // query.
          auth.reset()
          router.push('/login')
          return
        }

        if (response.status === 403 && path !== '/auth/me') {
          // Права на клиенте — снимок из /auth/me (docs/architecture.md, раздел
          // 10): 403 значит, что они успели устареть посреди сессии. Подтягиваем
          // актуальные права, но саму ошибку не глушим и не меняем — экран,
          // вызвавший запрос, сам решает, что показать по отказу. /auth/me
          // исключён из триггера: иначе его собственный (гипотетический) 403
          // зациклил бы обновление сам на себя.
          await auth.fetchMe()
        }
      },
    })
  }

  return {
    get: <T>(path: string, query?: Query) => request<T>('GET', path, undefined, query),
    post: <T>(path: string, body?: JsonBody) => request<T>('POST', path, body),
    put: <T>(path: string, body?: JsonBody) => request<T>('PUT', path, body),
    patch: <T>(path: string, body?: JsonBody) => request<T>('PATCH', path, body),
    delete: <T>(path: string, body?: JsonBody) => request<T>('DELETE', path, body),
  }
}
