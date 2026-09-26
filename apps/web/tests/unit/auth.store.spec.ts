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

  it('keeps the account when the server did not confirm the logout', async () => {
    post.mockResolvedValue(me)
    const auth = useAuthStore()
    await auth.login('ivan@example.com', 'secret123', false)

    post.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(auth.logout()).rejects.toThrow()

    // Сессия на сервере жива: притворяться вышедшим нельзя — перезагрузка
    // вернула бы человека в систему.
    expect(auth.user?.id).toBe('u1')
  })

  it('treats a 401 on logout as already signed out', async () => {
    post.mockResolvedValue(me)
    const auth = useAuthStore()
    await auth.login('ivan@example.com', 'secret123', false)

    post.mockRejectedValue(Object.assign(new Error('unauthenticated'), { statusCode: 401 }))
    await auth.logout()

    expect(auth.user).toBeNull()
  })

  it('stays empty when fetchMe gets a 401', async () => {
    get.mockRejectedValue(Object.assign(new Error('unauthenticated'), { statusCode: 401 }))

    const auth = useAuthStore()
    await auth.fetchMe()

    expect(auth.user).toBeNull()
    expect(auth.permissions.administrator).toBe(false)
  })

  it('forgets the connection trouble once the server answers 401', async () => {
    get.mockRejectedValueOnce(new Error('network'))
    const auth = useAuthStore()
    await auth.fetchMe()
    expect(auth.connectionLost).toBe(true)

    get.mockRejectedValueOnce(Object.assign(new Error('unauthenticated'), { statusCode: 401 }))
    await auth.fetchMe()

    expect(auth.connectionLost).toBe(false)
    expect(auth.user).toBeNull()
    expect(auth.initialized).toBe(true)
  })

  describe('when the server does not say who is signed in', () => {
    // Сеть пропала или идёт выкладка (502): это не ответ «гость». Сброс
    // сессии — только по 401, иначе вошедший человек оказался бы на экране
    // входа из-за мигнувшей связи.

    it('keeps the signed-in account and its permissions after a network failure', async () => {
      post.mockResolvedValue(me)
      const auth = useAuthStore()
      await auth.login('ivan@example.com', 'secret123', false)
      auth.initialized = true

      get.mockRejectedValue(new TypeError('Failed to fetch'))
      await auth.fetchMe()

      expect(auth.user?.id).toBe('u1')
      expect(auth.permissions.global).toContain('people.view')
      expect(auth.connectionLost).toBe(true)
      expect(auth.initialized).toBe(true)
    })

    it('keeps the signed-in account after a 502 during a deploy', async () => {
      post.mockResolvedValue(me)
      const auth = useAuthStore()
      await auth.login('ivan@example.com', 'secret123', false)

      get.mockRejectedValue(Object.assign(new Error('bad gateway'), { statusCode: 502 }))
      await auth.fetchMe()

      expect(auth.user?.id).toBe('u1')
      expect(auth.connectionLost).toBe(true)
    })

    it('leaves the first check unfinished, so the next attempt asks again', async () => {
      get.mockRejectedValue(new TypeError('Failed to fetch'))
      const auth = useAuthStore()

      await auth.fetchMe()

      expect(auth.initialized).toBe(false)
      expect(auth.connectionLost).toBe(true)
    })

    it('clears the connection trouble when the next attempt succeeds', async () => {
      const auth = useAuthStore()
      get.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(me)

      await auth.fetchMe()
      await auth.fetchMe()

      expect(auth.connectionLost).toBe(false)
      expect(auth.initialized).toBe(true)
      expect(auth.user?.id).toBe('u1')
    })
  })

  it('gives every reset its own empty permissions, not one shared object', () => {
    const auth = useAuthStore()
    auth.reset()
    auth.permissions.ministries.m1 = ['members.manage']

    auth.reset()

    expect(auth.permissions.ministries).toEqual({})
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
