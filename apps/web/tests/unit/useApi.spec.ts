// @vitest-environment nuxt
import { useRouter } from '#app'
import { createError, getRequestHeaders, type H3Event } from 'h3'
import { createPinia, setActivePinia } from 'pinia'
import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useApi } from '~/composables/useApi'
import { useAuthStore, type MeResponse } from '~/stores/auth'

const me: MeResponse = {
  user: { id: 'u1', phone: null, email: 'ivan@example.com' },
  person: { id: 'p1', last_name: 'Иванов', first_name: 'Иван', patronymic: null, status: 'member' },
  permissions: { administrator: false, global: ['people.view'], ministries: {} },
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('useApi 403 handling', () => {
  it('refreshes permissions from /auth/me and still rejects the caller with the original error', async () => {
    registerEndpoint('/api/v1/ministries', {
      method: 'GET',
      handler: () => {
        throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
      },
    })
    registerEndpoint('/api/v1/auth/me', {
      method: 'GET',
      handler: () => me,
    })

    const auth = useAuthStore()
    const api = useApi()

    expect(auth.user).toBeNull()

    await expect(api.get('/ministries')).rejects.toMatchObject({ statusCode: 403 })

    // Права подтянулись через fetchMe, а не были просто проигнорированы.
    expect(auth.user?.id).toBe('u1')
    expect(auth.permissions.global).toContain('people.view')
  })

  it('keeps the signed-in account when refreshing permissions after a 403 gets no answer', async () => {
    registerEndpoint('/api/v1/roles', {
      method: 'GET',
      handler: () => {
        throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
      },
    })
    registerEndpoint('/api/v1/auth/me', {
      method: 'GET',
      handler: () => {
        throw createError({ statusCode: 502, statusMessage: 'Bad Gateway' })
      },
    })

    const auth = useAuthStore()
    auth.setMe(me)
    auth.initialized = true
    const api = useApi()

    await expect(api.get('/roles')).rejects.toMatchObject({ statusCode: 403 })

    expect(auth.user?.id).toBe('u1')
    expect(auth.connectionLost).toBe(true)
  })

  it('does not loop when /auth/me itself answers 403', async () => {
    registerEndpoint('/api/v1/auth/me', {
      method: 'GET',
      handler: () => {
        throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
      },
    })

    const api = useApi()

    // Если бы обработчик 403 зациклился на повторных вызовах /auth/me, этот
    // await никогда бы не разрешился и тест завис бы до таймаута — сам факт,
    // что промис отклоняется один раз с исходной ошибкой, доказывает
    // отсутствие петли.
    await expect(api.get('/auth/me')).rejects.toMatchObject({ statusCode: 403 })
  })
})

describe('useApi 401 handling', () => {
  it('leaves navigation to the caller when /auth/me itself answers 401', async () => {
    registerEndpoint('/api/v1/auth/me', {
      method: 'GET',
      handler: () => {
        throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
      },
    })

    const router = useRouter()
    const push = vi.spyOn(router, 'push')
    const api = useApi()

    // fetchMe() (apps/web/app/stores/auth.ts) обрабатывает 401 сам через
    // reset() в своём catch, а куда вести после — решает middleware
    // (auth.global.ts), а не этот перехватчик: 401 от /auth/me — не сбой
    // посреди работы, а обычный ответ на вопрос "кто вошёл". Реальный кейс:
    // fetchMe() дёрнут посреди уже идущей навигации на /login?passwordChanged=1
    // (pages/password-reset/[token].vue) — push('/login') отсюда отменил бы
    // ту навигацию и стёр бы query.
    await expect(api.get('/auth/me')).rejects.toMatchObject({ statusCode: 401 })

    expect(push).not.toHaveBeenCalled()
  })

  it('still clears the store and goes to /login when some other path answers 401', async () => {
    registerEndpoint('/api/v1/ministries', {
      method: 'GET',
      handler: () => {
        throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
      },
    })

    const auth = useAuthStore()
    const router = useRouter()
    const push = vi.spyOn(router, 'push')
    const api = useApi()

    await expect(api.get('/ministries')).rejects.toMatchObject({ statusCode: 401 })

    expect(auth.user).toBeNull()
    expect(push).toHaveBeenCalledWith('/login')
  })
})

// Тестовая среда передаёт заголовки обработчику как есть, без приведения
// имён к нижнему регистру, как это делает настоящий HTTP; поэтому имя
// сравнивается без учёта регистра, а не через getHeader(event, 'accept').
function acceptOf(event: H3Event): string | undefined {
  return Object.entries(getRequestHeaders(event)).find(([name]) => name.toLowerCase() === 'accept')?.[1]
}

describe('useApi Accept header', () => {
  it('asks for JSON on every request, including GET without a body', async () => {
    // Без Accept: application/json сервер не считал запрос API-запросом и для
    // гостя строил перенаправление на вход вместо 401 (задача 32). ofetch сам
    // ставит этот заголовок только запросам с JSON-телом, поэтому GET и
    // запрос CSRF-cookie проверяются вместе с POST.
    const accept: Record<string, string | undefined> = {}
    registerEndpoint('/sanctum/csrf-cookie', {
      method: 'GET',
      handler: (event) => {
        accept.csrf = acceptOf(event)
        return ''
      },
    })
    registerEndpoint('/api/v1/people', {
      method: 'GET',
      handler: (event) => {
        accept.get = acceptOf(event)
        return { data: [] }
      },
    })
    registerEndpoint('/api/v1/roles', {
      method: 'POST',
      handler: (event) => {
        accept.post = acceptOf(event)
        return { data: {} }
      },
    })

    const api = useApi()
    await api.get('/people')
    await api.post('/roles', { name: 'Служитель' })

    expect(accept).toEqual({ get: 'application/json', csrf: 'application/json', post: 'application/json' })
  })
})
