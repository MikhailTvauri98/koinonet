type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
type JsonBody = Record<string, unknown>

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

async function ensureCsrfCookie(): Promise<void> {
  await $fetch('/sanctum/csrf-cookie', { credentials: 'include' })
}

export function useApi() {
  const auth = useAuthStore()
  const router = useRouter()

  async function request<T>(method: HttpMethod, path: string, body?: JsonBody): Promise<T> {
    // CSRF-cookie запрашивается перед небезопасными методами и только перед
    // ними: безопасные GET не меняют состояние и Sanctum её не требует.
    if (UNSAFE_METHODS.has(method)) {
      await ensureCsrfCookie()
    }

    const headers: Record<string, string> = {}
    const xsrfToken = readXsrfToken()
    if (xsrfToken) {
      headers['X-XSRF-TOKEN'] = xsrfToken
    }

    return await $fetch<T>(`${API_BASE}${path}`, {
      method,
      credentials: 'include',
      headers,
      body,
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
    get: <T>(path: string) => request<T>('GET', path),
    post: <T>(path: string, body?: JsonBody) => request<T>('POST', path, body),
    put: <T>(path: string, body?: JsonBody) => request<T>('PUT', path, body),
    patch: <T>(path: string, body?: JsonBody) => request<T>('PATCH', path, body),
    delete: <T>(path: string) => request<T>('DELETE', path),
  }
}
