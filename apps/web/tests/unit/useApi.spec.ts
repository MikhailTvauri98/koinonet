// @vitest-environment nuxt
import { useRouter } from '#app'
import { createError } from 'h3'
import { createPinia, setActivePinia } from 'pinia'
import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useApi } from '~/composables/useApi'
import { useAuthStore } from '~/stores/auth'

const me = {
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
