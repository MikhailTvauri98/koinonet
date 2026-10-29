// @vitest-environment nuxt
import { createPinia, setActivePinia } from 'pinia'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore, type MeResponse } from '~/stores/auth'

const { get, post, subscribe, unsubscribe } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn() }))
mockNuxtImport('useApi', () => () => ({ get, post }))
mockNuxtImport('useNotificationsStore', () => () => ({ subscribe, unsubscribe }))
const me: MeResponse = {
  user: { id: 'u1', phone: null, email: 'one@test.local' },
  person: { id: 'p1', last_name: 'Один', first_name: 'Иван', patronymic: null, status: 'member' },
  permissions: { administrator: false, global: [], ministries: {} },
}
beforeEach(() => { setActivePinia(createPinia()); vi.resetAllMocks() })

describe('personal notification lifecycle', () => {
  it('initializes on invitation setMe, login and fetchMe', async () => {
    const auth = useAuthStore()
    await auth.setMe(me)
    expect(subscribe).toHaveBeenLastCalledWith('u1')
    post.mockResolvedValue(me)
    await auth.login('one@test.local', 'secret', false)
    expect(subscribe).toHaveBeenCalledTimes(2)
    get.mockResolvedValue(me)
    await auth.fetchMe()
    expect(subscribe).toHaveBeenCalledTimes(3)
  })

  it('clears channel and private state on reset, 401 and confirmed logout', async () => {
    const auth = useAuthStore()
    await auth.setMe(me)
    auth.reset()
    expect(unsubscribe).toHaveBeenCalledOnce()
    await auth.setMe(me)
    get.mockRejectedValue({ statusCode: 401 })
    await auth.fetchMe()
    expect(unsubscribe).toHaveBeenCalledTimes(2)
    await auth.setMe(me)
    post.mockResolvedValue({})
    await auth.logout()
    expect(unsubscribe).toHaveBeenCalledTimes(3)
  })

  it('preserves the channel when logout fails and ignores a stale identity response after reset', async () => {
    const auth = useAuthStore()
    await auth.setMe(me)
    post.mockRejectedValue(new Error('offline'))
    await expect(auth.logout()).rejects.toThrow('offline')
    expect(unsubscribe).not.toHaveBeenCalled()
    let finish!: (value: MeResponse) => void
    get.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    const pending = auth.fetchMe()
    auth.reset()
    finish(me)
    await pending
    expect(auth.user).toBeNull()
    expect(subscribe).toHaveBeenCalledOnce()
  })

  it('does not finish the previous session check after reset during realtime setup', async () => {
    const auth = useAuthStore()
    get.mockResolvedValue(me)
    let finish!: () => void
    subscribe.mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve }))
    const pending = auth.fetchMe()
    await vi.waitFor(() => expect(subscribe).toHaveBeenCalled())
    auth.forgetSession()
    finish()
    await pending
    expect(auth.initialized).toBe(false)
    expect(auth.user).toBeNull()
  })
})
