// @vitest-environment nuxt
import { useRouter } from '#app'
import { createError, getQuery, readBody, getRequestHeaders, type H3Event } from 'h3'
import { createPinia, setActivePinia } from 'pinia'
import { mockNuxtImport, registerEndpoint } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useApi } from '~/composables/useApi'
import { useAuthStore, type MeResponse } from '~/stores/auth'

mockNuxtImport('useNotificationsStore', () => () => ({ subscribe: async () => {}, unsubscribe: () => {} }))

const me: MeResponse = {
  user: { id: 'u1', phone: null, email: 'ivan@example.com', ical_url: 'https://church.test/calendar.ics' },
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
  it.each([401, 403])('does not change B for a delayed push ownership %i response from A', async (statusCode) => {
    let finish!: () => void
    registerEndpoint('/sanctum/csrf-cookie', () => '')
    registerEndpoint('/api/v1/push-subscriptions', {
      method: 'POST',
      handler: async () => {
        await new Promise<void>(resolve => { finish = resolve })
        throw createError({ statusCode, statusMessage: 'Rejected' })
      },
    })
    const auth = useAuthStore()
    await auth.setMe(me)
    const result = useApi().post('/push-subscriptions', {}).catch(error => error)
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    auth.reset()
    await auth.setMe({ ...me, user: { ...me.user, id: 'B' } })
    const refresh = vi.spyOn(auth, 'fetchMe')
    finish()
    expect(await result).toMatchObject({ statusCode })
    expect(auth.user?.id).toBe('B')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('does not send a stale push mutation after CSRF resolves in a different session', async () => {
    let finish!: () => void
    const received = vi.fn(() => ({}))
    registerEndpoint('/sanctum/csrf-cookie', async () => {
      await new Promise<void>(resolve => { finish = resolve })
      return ''
    })
    registerEndpoint('/api/v1/push-subscriptions', { method: 'POST', handler: received })
    const auth = useAuthStore()
    await auth.setMe(me)
    const result = useApi().post('/push-subscriptions', {}).catch(error => error)
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    auth.reset()
    await auth.setMe({ ...me, user: { ...me.user, id: 'B' } })
    finish()
    await result
    expect(received).not.toHaveBeenCalled()
  })

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

describe('useApi notification transport', () => {
  it('encodes cursor query separately and supports JSON DELETE bodies', async () => {
    registerEndpoint('/sanctum/csrf-cookie', () => '')
    registerEndpoint('/api/v1/notifications', event => getQuery(event))
    registerEndpoint('/api/v1/push-subscriptions', { method: 'DELETE', handler: event => readBody(event) })
    const api = useApi()
    expect(await api.get('/notifications', { cursor: 'a+b/==' })).toEqual({ cursor: 'a+b/==' })
    expect(await api.delete('/push-subscriptions', { endpoint: 'https://push.test/one' })).toEqual({ endpoint: 'https://push.test/one' })
  })

  it('authorizes only the root broadcast route with shared JSON and CSRF headers', async () => {
    let csrfCalls = 0
    document.cookie = 'XSRF-TOKEN=csrf%2Btoken; path=/'
    registerEndpoint('/sanctum/csrf-cookie', () => { csrfCalls++; return '' })
    registerEndpoint('/broadcasting/auth', {
      method: 'POST',
      handler: async (event) => ({ body: await readBody(event), headers: getRequestHeaders(event) }),
    })
    const api = useApi()
    const result = await api.post<{ body: unknown, headers: Record<string, string> }>('/broadcasting/auth', { socket_id: '1.2', channel_name: 'private-user.u1' })
    expect(result.body).toEqual({ socket_id: '1.2', channel_name: 'private-user.u1' })
    expect(Object.entries(result.headers).find(([key]) => key.toLowerCase() === 'x-xsrf-token')?.[1]).toBe('csrf+token')
    expect(csrfCalls).toBe(1)
    await expect(api.post('https://evil.test/broadcasting/auth')).rejects.toThrow()
    await expect(api.post('//evil.test/broadcasting/auth')).rejects.toThrow()
    await expect(api.post('/broadcasting/other')).rejects.toThrow()
    document.cookie = 'XSRF-TOKEN=; Max-Age=0; path=/'
  })
})
