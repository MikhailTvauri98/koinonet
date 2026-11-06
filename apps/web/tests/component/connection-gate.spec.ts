// @vitest-environment nuxt
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { useRouter } from '#app'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import ConnectionGate from '~/components/ConnectionGate.vue'
import { useAuthStore, type MeResponse } from '~/stores/auth'
import { grantPermissions } from '../support/permissions'

const get = vi.fn()
mockNuxtImport('useApi', () => () => ({ get }))

const me: MeResponse = {
  user: { id: 'u1', phone: null, email: 'maria@example.com', ical_url: 'https://church.test/calendar.ics' },
  person: { id: 'p1', last_name: 'Прокопенко', first_name: 'Мария', patronymic: null, status: 'member' },
  permissions: { administrator: false, global: ['people.view'], ministries: {} },
}

// Экран за шлюзом — то, что app.vue кладёт внутрь: макет со страницей.
function mountGate() {
  return mountSuspended(ConnectionGate, { slots: { default: () => h('p', { 'data-test': 'screen' }, 'Экран') } })
}

enableAutoUnmount(afterEach)

beforeEach(() => {
  get.mockReset()
  grantPermissions()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('connection gate', () => {
  it('shows the screen and nothing else while the server answers', async () => {
    const gate = await mountGate()

    expect(gate.find('[data-test="screen"]').exists()).toBe(true)
    expect(gate.text()).not.toContain('Нет связи с сервером')
  })

  it('closes the app when the first check of the session got no answer', async () => {
    const auth = useAuthStore()
    auth.initialized = false
    auth.connectionLost = true

    const gate = await mountGate()

    expect(gate.find('[role="alert"]').text()).toContain('Нет связи с сервером.')
    expect(gate.find('[data-test="screen"]').exists()).toBe(false)
  })

  it('repeats the first check through the navigation guard, which decides where to go', async () => {
    const auth = useAuthStore()
    auth.initialized = false
    auth.connectionLost = true
    const replace = vi.spyOn(useRouter(), 'replace').mockResolvedValue(undefined)

    const gate = await mountGate()
    await gate.find('[data-test="retry-connection"]').trigger('click')
    await flushPromises()

    expect(replace).toHaveBeenCalledWith(expect.objectContaining({ force: true }))
  })

  it('keeps a failed navigation retry available without an unhandled rejection', async () => {
    const auth = useAuthStore()
    auth.initialized = false
    auth.connectionLost = true
    const gate = await mountGate()
    const replace = vi.spyOn(useRouter(), 'replace').mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined)
    await gate.get('[data-test="retry-connection"]').trigger('click')
    await flushPromises()
    expect(gate.text()).toContain('Не удалось повторить проверку')
    expect(gate.get('[data-test="retry-connection"]').attributes('disabled')).toBeUndefined()
    await gate.get('[data-test="retry-connection"]').trigger('click')
    await flushPromises()
    expect(replace).toHaveBeenCalledTimes(2)
  })

  it('keeps the screen and offers a retry when a refresh of the session got no answer mid-session', async () => {
    useAuthStore().connectionLost = true

    const gate = await mountGate()

    expect(gate.find('[role="alert"]').text()).toContain('Нет связи с сервером.')
    expect(gate.find('[data-test="screen"]').exists()).toBe(true)
  })

  it('hides the notice once the retried refresh succeeds', async () => {
    useAuthStore().connectionLost = true
    get.mockResolvedValue(me)

    const gate = await mountGate()
    await gate.find('[data-test="retry-connection"]').trigger('click')
    await flushPromises()

    expect(get).toHaveBeenCalledWith('/auth/me')
    expect(gate.text()).not.toContain('Нет связи с сервером')
  })
})
