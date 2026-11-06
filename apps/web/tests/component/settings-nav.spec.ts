// @vitest-environment nuxt
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DevicesPage from '~/pages/settings/devices.vue'
import LoginSettingsPage from '~/pages/settings/login.vue'
import ProfilePage from '~/pages/settings/profile.vue'

// Ревью task-30 (Important, п.2): AppNav ведёт только на /settings/profile,
// а сами три экрана друг на друга не ссылались — «Вход» и «Устройства» были
// недостижимы без ручного ввода адреса. Тот же приём, что уже есть в
// проекте для разделов одной сущности — вкладки карточки служения
// (`ministry-card__tabs`, pages/ministries/[id]/index.vue): каждый экран
// показывает ссылки на оба соседних, с себя не ссылается активной вкладкой.
const get = vi.fn()
const patch = vi.fn()

mockNuxtImport('useApi', () => () => ({ get, patch }))

beforeEach(() => {
  get.mockReset().mockResolvedValue({ data: { contacts: { phone: null, email: null, birth_date: null }, contacts_public: false } })
  patch.mockReset()
  setActivePinia(createPinia())
})

describe('navigation between the three account settings screens', () => {
  it('links from "Профиль" to "Вход" and "Устройства"', async () => {
    const page = await mountSuspended(ProfilePage)
    await flushPromises()

    expect(page.find('a[href="/settings/login"]').exists()).toBe(true)
    expect(page.find('a[href="/settings/devices"]').exists()).toBe(true)
  })

  it('links from "Вход" to "Профиль" and "Устройства"', async () => {
    const page = await mountSuspended(LoginSettingsPage)

    expect(page.find('a[href="/settings/profile"]').exists()).toBe(true)
    expect(page.find('a[href="/settings/devices"]').exists()).toBe(true)
  })

  it('links from "Устройства" to "Профиль" and "Вход"', async () => {
    get.mockResolvedValue({ data: [] })
    const page = await mountSuspended(DevicesPage)
    await flushPromises()

    expect(page.find('a[href="/settings/profile"]').exists()).toBe(true)
    expect(page.find('a[href="/settings/login"]').exists()).toBe(true)
  })
})


it('names security clearly and keeps every settings destination', async () => {
  const page = await mountSuspended(ProfilePage)
  expect(page.get('a[href="/settings/login"]').text()).toBe('Безопасность')
  for (const target of ['profile', 'login', 'devices', 'notifications', 'ical', 'appearance']) {
    expect(page.find(`a[href="/settings/${target}"]`).exists()).toBe(true)
  }
})
