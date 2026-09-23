// @vitest-environment nuxt
import { createError } from 'h3'
import { createPinia, setActivePinia } from 'pinia'
import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it } from 'vitest'
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
