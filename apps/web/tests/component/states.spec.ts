// @vitest-environment nuxt
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '~/app.vue'
import { useNuxtApp, useRouter } from '#app'
import PeoplePage from '~/pages/people/index.vue'
import PersonForm from '~/components/people/PersonForm.vue'
import type { Person } from '~/utils/people'
import AnnouncementList from '~/components/announcements/AnnouncementList.vue'
import AnnouncementEditor from '~/components/announcements/AnnouncementEditor.vue'
import ChatList from '~/components/chat/ChatList.vue'
import EventList from '~/components/calendar/EventList.vue'
import NotificationsPage from '~/pages/notifications.vue'
import ChatsPage from '~/pages/chats/index.vue'
import { useChatsStore } from '~/stores/chats'
import { useAuthStore } from '~/stores/auth'
import { useNotificationsStore } from '~/stores/notifications'
import { grantPermissions } from '../support/permissions'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
mockNuxtImport('useApi', () => () => ({ get }))
const list = (data: unknown[] = [], page = 1, last = 1) => ({ data, meta: { current_page: page, last_page: last, unread_count: 0 }, next_cursor: null })
const statePerson: Person = { id: 'p-state', first_name: 'Человек', last_name: 'Прежний', patronymic: null, full_name: 'Прежний человек', status: 'member', archived: false, photo_url: null, has_account: false, user_id: null, has_global_roles: false, account_disabled: false }
const announcement = { id: 'a-state', scope: 'church', ministry: null, author: null, title: 'Сохранённое объявление', body: 'Текст', pinned: false, hide_after: null, notify_on_publish: true, published_at: '2026-11-01T07:00:00Z', archived: false, attachments: [] }
enableAutoUnmount(afterEach)
beforeEach(() => {
  vi.resetAllMocks()
  grantPermissions()
  useNotificationsStore().unsubscribe()
  get.mockResolvedValue(list())
})

describe('list feedback', () => {
  it('announces pending route work and removes the notice when navigation finishes', async () => {
    const app = await mountSuspended(App, { global: { stubs: { NuxtPage: true, NuxtLayout: true, InstallPrompt: true, PushLifecycleError: true } } })
    await useNuxtApp().callHook('page:loading:start')
    await new Promise(resolve => setTimeout(resolve, 250))
    await flushPromises()
    expect(app.get('.route-loading[role=status]').text()).toContain('Загружаем страницу')
    await useNuxtApp().callHook('page:loading:end')
    await new Promise(resolve => setTimeout(resolve, 250))
    await flushPromises()
    expect(app.find('.route-loading').exists()).toBe(false)
  })
  it('explains people next steps according to current permission and filters', async () => {
    grantPermissions({ global: ['people.view'] })
    const page = await mountSuspended(PeoplePage)
    expect(page.get('[role=status]').text()).toContain('Измените поиск или фильтры')
    expect(page.get('[role=status]').text()).not.toContain('Создайте')
    grantPermissions({ global: ['people.view', 'people.manage'] })
    await flushPromises()
    expect(page.get('[role=status]').text()).toContain('Создайте человека')
    await page.get('[data-test=filter-status]').setValue('guest')
    await flushPromises()
    expect(page.get('[role=status]').text()).toContain('Измените поиск или фильтры')
  })
  it('explains publishing only to a publisher, and never shows empty while retrying', async () => {
    const page = await mountSuspended(AnnouncementList)
    expect(page.get('[role=status]').text()).toContain('Здесь появятся')
    expect(page.text()).not.toContain('Создайте первое')
    grantPermissions({ global: ['announcements.church.publish'] })
    await flushPromises()
    expect(page.get('[role=status]').text()).toContain('Опубликуйте первое')
    let finish!: (value: unknown) => void
    get.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    await page.get('select').setValue('ministry')
    expect(page.get('[role=status]').text()).toContain('Загружаем объявления')
    expect(page.text()).not.toContain('Объявлений пока нет')
    finish(list()); await flushPromises()
  })
  it('retains announcements during refresh and recoverable failure, then clears a forbidden snapshot', async () => {
    grantPermissions({ global: ['announcements.church.publish'] })
    get.mockResolvedValue(list([announcement]))
    const page = await mountSuspended(AnnouncementList)
    await page.get('[data-test=publish]').trigger('click')
    let reject!: (error: unknown) => void
    get.mockReturnValueOnce(new Promise((_, fail) => { reject = fail }))
    page.getComponent(AnnouncementEditor).vm.$emit('saved')
    await flushPromises()
    expect(page.text()).toContain(announcement.title)
    expect(page.get('[role=status]').text()).toContain('Обновляем объявления')
    reject({ statusCode: 500 }); await flushPromises()
    expect(page.text()).toContain(announcement.title)
    expect(page.get('[role=alert]').text()).toContain('Повторить')
    get.mockRejectedValueOnce({ statusCode: 403 })
    await page.get('[data-test=retry-announcements]').trigger('click'); await flushPromises()
    expect(page.text()).not.toContain(announcement.title)
    expect(page.get('[role=alert]').text()).toContain('Нет права')
    expect(page.text()).not.toContain('Объявлений пока нет')
  })
  it('restarts announcement pagination after a forbidden next page clears its snapshot', async () => {
    get.mockResolvedValueOnce(list([announcement], 1, 2))
    const page = await mountSuspended(AnnouncementList)
    get.mockRejectedValueOnce({ statusCode: 403 })
    await page.get('[data-test=more]').trigger('click'); await flushPromises()
    expect(page.text()).not.toContain(announcement.title)
    get.mockResolvedValueOnce(list([announcement], 1, 2))
    await page.get('[data-test=retry-announcements]').trigger('click'); await flushPromises()
    expect(get).toHaveBeenLastCalledWith('/announcements', expect.objectContaining({ page: 1 }))
    expect(page.text()).toContain(announcement.title)
  })
  it('clears announcements and rejects old results when the session changes', async () => {
    get.mockResolvedValue(list([announcement]))
    const page = await mountSuspended(AnnouncementList)
    let finish!: (value: unknown) => void
    get.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    await page.get('select').setValue('ministry')
    get.mockResolvedValueOnce(list())
    const auth = useAuthStore()
    await auth.setMe({ user: { ...auth.user!, id: auth.user!.id + '-next' }, person: auth.person!, permissions: auth.permissions })
    await flushPromises()
    finish(list([announcement])); await flushPromises()
    expect(page.text()).not.toContain(announcement.title)
    expect(page.text()).toContain('Объявлений пока нет')
  })
  it('does not retain people across sessions with identical viewing permissions', async () => {
    grantPermissions({ global: ['people.view'] })
    get.mockImplementation((path: string) => Promise.resolve(path === '/ministries' ? list() : list([statePerson])))
    const page = await mountSuspended(PeoplePage)
    expect(page.text()).toContain('Прежний человек')
    get.mockResolvedValue(list())
    const auth = useAuthStore()
    await auth.setMe({ user: { ...auth.user!, id: auth.user!.id + '-next' }, person: auth.person!, permissions: auth.permissions })
    await flushPromises()
    expect(page.text()).not.toContain('Прежний человек')
    expect(page.text()).toContain('Люди не найдены')
  })
  it('keeps people visible while the same filters refresh after creation', async () => {
    grantPermissions({ global: ['people.view', 'people.manage'] })
    get.mockImplementation((path: string) => Promise.resolve(path === '/ministries' ? list() : list([statePerson])))
    const page = await mountSuspended(PeoplePage)
    await page.get('[data-test=create-person]').trigger('click')
    let finish!: (value: unknown) => void
    get.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    page.getComponent(PersonForm).vm.$emit('created', { data: statePerson, warnings: [] })
    await flushPromises()
    expect(page.text()).toContain('Человек создан')
    expect(page.text()).toContain('Прежний человек')
    expect(page.get('.loading-state').text()).toContain('людей')
    finish(list([{ ...statePerson, id: 'p-new', full_name: 'Новый человек' }])); await flushPromises()
    expect(page.text()).toContain('Новый человек')
    expect(page.text()).not.toContain('Прежний человек')
  })
  it('clears loaded people on a forbidden next page even if the permissions refresh has no answer', async () => {
    grantPermissions({ global: ['people.view'] })
    get.mockImplementation((path: string) => Promise.resolve(path === '/ministries' ? list() : list([statePerson], 1, 2)))
    const page = await mountSuspended(PeoplePage)
    get.mockRejectedValueOnce({ statusCode: 403 })
    await page.get('[data-test=load-more]').trigger('click'); await flushPromises()
    expect(page.text()).not.toContain('Прежний человек')
    expect(page.get('[role=alert]').text()).toContain('Нет права')
    expect(page.text()).not.toContain('Люди не найдены')
  })
  it('offers the next available chat step without unauthorized group creation', async () => {
    const page = await mountSuspended(ChatList, { props: { chats: [] } })
    expect(page.text()).toContain('Здесь появятся чаты')
    expect(page.text()).not.toContain('Создайте группу')
    grantPermissions({ global: ['chats.create_groups'] }); await flushPromises()
    expect(page.text()).toContain('Создайте группу')
  })
  it('keeps a failed chat refresh from claiming that an empty list is a successful result', async () => {
    useChatsStore().unsubscribeUser()
    const page = await mountSuspended(ChatsPage)
    expect(page.text()).toContain('Чатов пока нет')
    get.mockRejectedValueOnce(new Error('offline'))
    await useChatsStore().fetch(); await flushPromises()
    expect(page.text()).toContain('Не удалось загрузить чаты')
    expect(page.text()).not.toContain('Чатов пока нет')
  })
  it('does not navigate from a pending notification read after the account changes', async () => {
    get.mockResolvedValue({ ...list(), data: [{ id: 'n-state', category: 'announcements', title: 'Прежнее уведомление', body: '', url: '/announcements/old', read_at: null, created_at: '2026-11-01T07:00:00Z' }] })
    const page = await mountSuspended(NotificationsPage)
    const push = vi.spyOn(useRouter(), 'push').mockResolvedValue(undefined)
    let finish!: () => void
    vi.spyOn(useNotificationsStore(), 'markRead').mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
    await page.get('[data-test=notification-n-state]').trigger('click')
    const auth = useAuthStore()
    await auth.setMe({ user: { ...auth.user!, id: auth.user!.id + '-next' }, person: auth.person!, permissions: auth.permissions })
    finish(); await flushPromises()
    expect(push).not.toHaveBeenCalled()
    push.mockRestore()
  })
  it('does not navigate from a pending notification read after leaving the page', async () => {
    get.mockResolvedValue({ ...list(), data: [{ id: 'n-state', category: 'announcements', title: 'Уведомление', body: '', url: '/announcements/old', read_at: null, created_at: '2026-11-01T07:00:00Z' }] })
    const page = await mountSuspended(NotificationsPage)
    const push = vi.spyOn(useRouter(), 'push').mockResolvedValue(undefined)
    let finish!: () => void
    vi.spyOn(useNotificationsStore(), 'markRead').mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
    await page.get('[data-test=notification-n-state]').trigger('click')
    page.unmount()
    finish(); await flushPromises()
    expect(push).not.toHaveBeenCalled()
    push.mockRestore()
  })
  it('explains calendar range and notifications without invented content', async () => {
    const events = await mountSuspended(EventList, { props: { events: [] } })
    expect(events.text()).toContain('Выберите другой период')
    const notifications = await mountSuspended(NotificationsPage)
    expect(notifications.get('[role=status]').text()).toContain('назначения')
    expect(notifications.find('a[href="/settings/notifications"]').exists()).toBe(true)
    expect(notifications.text()).not.toContain('Всё прочитано')
  })
})



