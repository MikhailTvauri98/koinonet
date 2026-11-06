// @vitest-environment nuxt
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import NotificationsPage from '~/pages/notifications.vue'
import NotificationSettingsPage from '~/pages/settings/notifications.vue'
import AppNav from '~/components/AppNav.vue'
import { useSettingsStore } from '~/stores/settings'
import { useNotificationsStore } from '~/stores/notifications'
import { useRouter } from '#app'
import { grantPermissions } from '../support/permissions'

const { get, post, put } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }))
let push: ReturnType<typeof vi.spyOn>
mockNuxtImport('useApi', () => () => ({ get, post, put }))
enableAutoUnmount(afterEach)
beforeEach(() => {
  vi.resetAllMocks()
  push = vi.spyOn(useRouter(), 'push').mockResolvedValue(undefined)
  grantPermissions()
  useNotificationsStore().unsubscribe()
})
const entry = { id: 'n1', category: 'announcements', title: 'Собрание', body: 'В 10:00', url: '/announcements/a1', read_at: null, created_at: '2026-10-01T10:00:00Z' }
const response = { data: [entry], next_cursor: null, meta: { unread_count: 1 } }

describe('notification center', () => {
  it('renders, marks read on click then navigates to the notification URL', async () => {
    get.mockResolvedValue(response)
    post.mockResolvedValue({ unread_count: 0 })
    const page = await mountSuspended(NotificationsPage)
    expect(page.text()).toContain('Собрание')
    await page.find('[data-test="notification-n1"]').trigger('click')
    await flushPromises()
    expect(post).toHaveBeenCalledWith('/notifications/read', { ids: ['n1'] })
    expect(push).toHaveBeenCalledWith('/announcements/a1')
  })

  it('shows empty state and hides mark all when nothing is unread', async () => {
    get.mockResolvedValue({ data: [], next_cursor: null, meta: { unread_count: 0 } })
    const page = await mountSuspended(NotificationsPage)
    expect(page.text()).toContain('Уведомлений пока нет')
    expect(page.find('[data-test="mark-all-read"]').exists()).toBe(false)
  })

  it('shows errors with retry, preserves the list after a failed read and can mark all', async () => {
    get.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(response)
    const page = await mountSuspended(NotificationsPage)
    expect(page.text()).toContain('Не удалось загрузить уведомления')
    await page.find('[data-test="retry"]').trigger('click')
    await flushPromises()
    post.mockRejectedValueOnce(new Error('offline'))
    await page.find('[data-test="notification-n1"]').trigger('click')
    await flushPromises()
    expect(page.text()).toContain('Не удалось отметить уведомления')
    expect(push).not.toHaveBeenCalled()
    post.mockResolvedValue({ unread_count: 0 })
    await page.find('[data-test="mark-all-read"]').trigger('click')
    await flushPromises()
    expect(post).toHaveBeenLastCalledWith('/notifications/read', { all: true })
  })

  it('groups a year boundary by the church day and exposes unread text on each unread row', async () => {
    useSettingsStore().timezone = 'Europe/Moscow'
    get.mockResolvedValue({ data: [
      { ...entry, id: 'jan', created_at: '2026-12-31T21:05:00Z' },
      { ...entry, id: 'jan-read', created_at: '2027-01-01T07:00:00Z', read_at: '2027-01-01T08:00:00Z' },
      { ...entry, id: 'dec', created_at: '2026-12-31T20:59:00Z' },
    ], next_cursor: null, meta: { unread_count: 2 } })
    const page = await mountSuspended(NotificationsPage)
    const groups = page.findAll('.notification-list__group')
    expect(groups).toHaveLength(2)
    expect(groups[0]!.find('h2').text()).toBe('1 янв. 2027 г.')
    expect(groups[0]!.findAll('button')).toHaveLength(2)
    expect(groups[0]!.text()).toContain('00:05')
    expect(groups[1]!.find('h2').text()).toBe('31 дек. 2026 г.')
    expect(page.get('[data-test="notification-jan"]').text()).toContain('Непрочитано')
    expect(page.get('[data-test="notification-jan-read"]').text()).not.toContain('Непрочитано')
  })

  it('keeps mark-all pending without announcing success and restores unread after rejection', async () => {
    get.mockResolvedValue(response)
    let reject!: (error: Error) => void
    post.mockReturnValue(new Promise((_, fail) => { reject = fail }))
    const page = await mountSuspended(NotificationsPage)
    await page.get('[data-test="mark-all-read"]').trigger('click')
    expect(page.get('[data-test="mark-all-read"]').attributes('disabled')).toBeDefined()
    expect(page.get('[data-test="notification-summary"]').text()).toContain('Отмечаем')
    expect(page.text()).not.toContain('Все уведомления прочитаны')
    reject(new Error('offline'))
    await flushPromises()
    expect(page.get('[role="alert"]').text()).toContain('Не удалось отметить')
    expect(page.get('[data-test="notification-n1"]').text()).toContain('Непрочитано')
    expect(useNotificationsStore().unreadCount).toBe(1)
  })

  it('keeps a live notification when an older snapshot and its retry fail', async () => {
    get.mockResolvedValue(response)
    const page = await mountSuspended(NotificationsPage)
    const store = useNotificationsStore()
    let finish!: (value: typeof response) => void
    get.mockReturnValueOnce(new Promise(resolve => { finish = resolve })).mockRejectedValueOnce(new Error('offline'))
    const pending = store.fetch(true)
    store.push({ ...entry, id: 'live', title: 'Новое назначение' })
    finish(response)
    await pending
    await flushPromises()
    expect(page.get('[data-test="notification-live"]').text()).toContain('Новое назначение')
    expect(store.unreadCount).toBe(2)
    expect(page.text()).toContain('Не удалось загрузить уведомления')
  })

  it('distinguishes a confirmed read from failed navigation without sending the read twice', async () => {
    get.mockResolvedValue(response)
    post.mockResolvedValue({ unread_count: 0 })
    push.mockRejectedValueOnce(new Error('navigation failed')).mockResolvedValueOnce(undefined)
    const page = await mountSuspended(NotificationsPage)
    await page.get('[data-test="notification-n1"]').trigger('click')
    await flushPromises()
    expect(page.get('[role="alert"]').text()).toContain('Уведомление прочитано')
    expect(page.text()).not.toContain('Не удалось отметить')
    await page.get('[data-test="notification-n1"]').trigger('click')
    await flushPromises()
    expect(post).toHaveBeenCalledOnce()
    expect(push).toHaveBeenCalledTimes(2)
  })

  it('updates the navigation badge reactively and keeps category settings reachable', async () => {
    const nav = await mountSuspended(AppNav)
    expect(nav.find('a[href="/notifications"]').exists()).toBe(true)
    expect(nav.find('[data-test="notification-badge"]').exists()).toBe(false)
    useNotificationsStore().push(entry)
    await flushPromises()
    expect(nav.find('[data-test="notification-badge"]').text()).toBe('1')
  })
})

describe('notification category settings', () => {
  it('renders categories and sends just one changed category', async () => {
    get.mockResolvedValue({ data: [
      { category: 'announcements', label: 'Объявления', enabled: true },
      { category: 'reminders', label: 'Напоминания', enabled: true },
    ] })
    put.mockResolvedValue({ data: [] })
    const page = await mountSuspended(NotificationSettingsPage)
    expect(page.find('a[href="/settings/devices"]').exists()).toBe(true)
    expect(page.findAll('h2').filter(heading => heading.text() === 'Пуши на этом устройстве')).toHaveLength(1)
    await page.find('[data-test="category-reminders"]').setValue(false)
    await flushPromises()
    expect(put).toHaveBeenCalledExactlyOnceWith('/notification-settings', { settings: { reminders: false } })
  })

  it('restores the category toggle and shows an error when saving fails', async () => {
    get.mockResolvedValue({ data: [{ category: 'chat', label: 'Чаты', enabled: true }] })
    put.mockRejectedValue(new Error('offline'))
    const page = await mountSuspended(NotificationSettingsPage)
    await page.find('[data-test="category-chat"]').setValue(false)
    await flushPromises()
    expect((page.find('[data-test="category-chat"]').element as HTMLInputElement).checked).toBe(true)
    expect(page.text()).toContain('Не удалось сохранить настройки')
  })
})
