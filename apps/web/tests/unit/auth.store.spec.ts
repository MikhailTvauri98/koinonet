// @vitest-environment nuxt
import { createPinia, setActivePinia } from 'pinia'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore, type MeResponse } from '~/stores/auth'

const get = vi.fn()
const post = vi.fn()

mockNuxtImport('useApi', () => () => ({ get, post }))

const me: MeResponse = {
  user: { id: 'u1', phone: null, email: 'ivan@example.com' },
  person: { id: 'p1', first_name: 'Иван', last_name: 'Иванов', patronymic: null, status: 'member' },
  permissions: { administrator: false, global: ['people.view'], ministries: {} },
}

beforeEach(() => {
  setActivePinia(createPinia())
  get.mockReset()
  post.mockReset()
})

describe('auth store', () => {
  it('keeps the person and the permissions after login', async () => {
    post.mockResolvedValue(me)

    const auth = useAuthStore()
    await auth.login('ivan@example.com', 'secret123', true)

    expect(auth.person?.first_name).toBe('Иван')
    expect(auth.permissions.global).toContain('people.view')
    expect(post).toHaveBeenCalledWith('/auth/login', {
      login: 'ivan@example.com', password: 'secret123', remember: true,
    })
  })

  it('clears the state on logout', async () => {
    post.mockResolvedValue(me)
    const auth = useAuthStore()
    await auth.login('ivan@example.com', 'secret123', false)

    post.mockResolvedValue({})
    await auth.logout()

    expect(auth.user).toBeNull()
    expect(auth.permissions.global).toEqual([])
  })

  it('stays empty when fetchMe gets a 401', async () => {
    get.mockRejectedValue(Object.assign(new Error('unauthenticated'), { statusCode: 401 }))

    const auth = useAuthStore()
    await auth.fetchMe()

    expect(auth.user).toBeNull()
    expect(auth.permissions.administrator).toBe(false)
  })

  describe('forgetSession', () => {
    // pages/password-reset/[token].vue зовёт forgetSession() перед переходом
    // на /login, не зная, чья сессия была в этой вкладке — своя (сервер её
    // только что убил) или чужая (сервер её не трогал). Оба случая должны
    // разрешиться правильно на ближайшем fetchMe(), которым middleware
    // перепроверяет, кто вошёл, — а не тем, что было в сторе до сброса.

    it('drops the local account immediately and lets the next fetchMe confirm the server logged it out', async () => {
      const auth = useAuthStore()
      auth.user = { id: 'u1', phone: null, email: 'maria@example.com' }
      auth.initialized = true

      auth.forgetSession()

      // Сразу после forgetSession(), ещё до любого запроса к серверу: сторая
      // не должен продолжать выглядеть вошедшим, и middleware обязан
      // перепроверить (initialized сброшен).
      expect(auth.user).toBeNull()
      expect(auth.initialized).toBe(false)

      get.mockRejectedValue(Object.assign(new Error('unauthenticated'), { statusCode: 401 }))
      await auth.fetchMe()

      expect(auth.user).toBeNull()
      expect(auth.initialized).toBe(true)
    })

    it('restores a different account whose own session the server did not touch', async () => {
      const auth = useAuthStore()
      // Другой аккаунт был вошедшим в этой же вкладке (например
      // администратор открыл чужую ссылку сброса, чтобы её проверить) —
      // его сессию AcceptAccessLink.php не трогает вовсе.
      auth.user = { id: 'admin1', phone: null, email: 'admin@example.com' }
      auth.initialized = true

      auth.forgetSession()
      get.mockResolvedValue(me)
      await auth.fetchMe()

      // Сервер подтвердил: сессия жива, это тот же (другой) аккаунт — а не
      // гость и не тот, кого сбросили.
      expect(auth.user?.id).toBe(me.user.id)
      expect(auth.initialized).toBe(true)
    })
  })
})
