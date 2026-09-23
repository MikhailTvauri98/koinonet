// @vitest-environment nuxt
import { createPinia, setActivePinia } from 'pinia'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '~/stores/auth'

const get = vi.fn()
const post = vi.fn()

mockNuxtImport('useApi', () => () => ({ get, post }))

const me = {
  user: { id: 'u1', phone: null, email: 'ivan@example.com' },
  person: { id: 'p1', first_name: 'Иван', last_name: 'Иванов' },
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
})
