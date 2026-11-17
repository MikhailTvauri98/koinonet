// @vitest-environment nuxt
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { useRouter } from '#app'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppNav from '~/components/AppNav.vue'
import { useAuthStore } from '~/stores/auth'
import { useChatsStore } from '~/stores/chats'
import { useNotificationsStore } from '~/stores/notifications'
import { grantPermissions } from '../support/permissions'

const navigateToMock = vi.hoisted(() => vi.fn())
mockNuxtImport('useApi', () => () => ({ get: vi.fn().mockResolvedValue({ data: [] }) }))
mockNuxtImport('navigateTo', () => navigateToMock)
enableAutoUnmount(afterEach)
beforeEach(() => { grantPermissions(); vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) { this.open = true }); vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) { this.open = false }) })
afterEach(() => { navigateToMock.mockReset(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
async function openMore() {
  const nav = await mountSuspended(AppNav)
  await nav.get('[data-test="nav-more"]').trigger('click')
  return nav
}
describe('phone navigation', () => {
  it('opens always available secondary sections without granting forbidden links', async () => {
    const nav = await openMore()
    const dialog = nav.get('dialog[open]')
    expect(dialog.findAll('a').map(a => a.text())).toEqual(['Объявления', 'Профиль', 'Календарь телефона'])
    expect(dialog.attributes('aria-label')).toBe('Ещё')
  })
  it('includes every permitted secondary destination with all permissions', async () => {
    grantPermissions({ administrator: true })
    const nav = await openMore()
    expect(nav.get('dialog[open]').findAll('a').map(a => a.attributes('href'))).toEqual(['/people', '/ministries', '/templates', '/announcements', '/settings/profile', '/settings/ical', '/admin/roles', '/admin/settings', '/admin/audit'])
  })
  it('includes ministry-only management without exposing global administration', async () => {
    grantPermissions({ ministries: { m1: ['events.manage'] } })
    const nav = await openMore()
    expect(nav.get('dialog[open]').findAll('a').map(a => a.attributes('href'))).toEqual(['/ministries', '/templates', '/announcements', '/settings/profile', '/settings/ical'])
  })
  it('closes on permission revocation and recomputes available destinations', async () => {
    grantPermissions({ administrator: true })
    const nav = await openMore()
    grantPermissions(); await flushPromises()
    expect(nav.find('dialog[open]').exists()).toBe(false)
    await nav.get('[data-test="nav-more"]').trigger('click')
    expect(nav.get('dialog[open]').findAll('a').map(a => a.text())).toEqual(['Объявления', 'Профиль', 'Календарь телефона'])
  })
  it('closes when the session changes', async () => {
    const nav = await openMore()
    useAuthStore().sessionVersion++; await flushPromises()
    expect(nav.find('dialog[open]').exists()).toBe(false)
  })
  it('closes on route changes and marks nested secondary sections active', async () => {
    grantPermissions({ global: ['people.view'] })
    const nav = await openMore()
    await useRouter().push('/people/p1'); await flushPromises()
    expect(nav.find('dialog[open]').exists()).toBe(false)
    expect(nav.get('[data-test="nav-more"]').classes()).toContain('app-nav__item--active')
    await nav.get('[data-test="nav-more"]').trigger('click')
    expect(nav.get('dialog[open] a[href="/people"]').attributes('aria-current')).toBe('page')
    await nav.get('dialog[open] a[href="/people"]').trigger('click')
    expect(nav.find('dialog[open]').exists()).toBe(false)
  })
  it('retains one live unread badge per primary destination', async () => {
    useChatsStore().unreadTotal = 12; useNotificationsStore().unreadCount = 3
    const nav = await mountSuspended(AppNav)
    expect(nav.findAll('[data-test="chat-badge"]')).toHaveLength(1)
    expect(nav.get('[data-test="chat-badge"]').text()).toBe('12')
    expect(nav.get('[data-test="notification-badge"]').text()).toBe('3')
  })
  it('marks the phone calendar destination without also selecting profile', async () => {
    const nav = await openMore()
    await useRouter().push('/settings/ical'); await flushPromises()
    await nav.get('[data-test="nav-more"]').trigger('click')
    expect(nav.get('dialog[open] a[href="/settings/ical"]').attributes('aria-current')).toBe('page')
    expect(nav.get('dialog[open] a[href="/settings/profile"]').attributes('aria-current')).toBeUndefined()
  })
})

describe('desktop navigation', () => {
  it('keeps phone-only destinations out of the desktop list but in the phone sections', async () => {
    const nav = await mountSuspended(AppNav)
    expect(nav.findAll('a.app-nav__phone-only').map(a => a.attributes('href'))).toEqual(['/settings/profile', '/settings/ical'])
    expect(nav.findAll('a:not(.app-nav__phone-only)').map(a => a.attributes('href'))).toEqual(['/', '/calendar', '/announcements', '/chats', '/notifications'])
  })
  it('groups administration under a visible label and only with the permissions present', async () => {
    grantPermissions({ global: ['audit.view'] })
    const nav = await mountSuspended(AppNav)
    const group = nav.get('[data-test="nav-admin"]')
    expect(group.get('.app-nav__group-label').text()).toBe('Управление')
    expect(group.attributes('aria-labelledby')).toBe(group.get('.app-nav__group-label').attributes('id'))
    expect(group.findAll('a').map(a => a.attributes('href'))).toEqual(['/admin/audit'])
    grantPermissions(); await flushPromises()
    expect(nav.find('[data-test="nav-admin"]').exists()).toBe(false)
    expect(nav.text()).not.toContain('Управление')
  })
  it('shows the user block with the full name and opens the menu with profile, appearance, phone calendar and logout', async () => {
    const nav = await mountSuspended(AppNav)
    const user = nav.get('[data-test="nav-user"]')
    expect(user.text()).toContain('Тест Вошедший')
    expect(user.find('.ui-avatar').exists()).toBe(true)
    expect(user.attributes('aria-haspopup')).toBe('dialog')
    expect(user.attributes('aria-expanded')).toBe('false')
    await user.trigger('click')
    expect(user.attributes('aria-expanded')).toBe('true')
    const menu = nav.get('dialog[open]')
    expect(menu.findAll('a').map(a => [a.text(), a.attributes('href')])).toEqual([['Профиль', '/settings/profile'], ['Оформление', '/settings/appearance'], ['Календарь телефона', '/settings/ical']])
    expect(menu.get('[data-test="nav-logout"]').text()).toBe('Выйти')
  })
  it('logs out through the existing store flow and leaves for the login page', async () => {
    const auth = useAuthStore()
    const logout = vi.spyOn(auth, 'logout').mockImplementation(async () => { auth.reset() })
    const nav = await mountSuspended(AppNav)
    await nav.get('[data-test="nav-user"]').trigger('click')
    await nav.get('[data-test="nav-logout"]').trigger('click'); await flushPromises()
    expect(logout).toHaveBeenCalledOnce()
    expect(navigateToMock).toHaveBeenCalledWith('/login')
  })
  it('keeps the menu open and says why when logout fails', async () => {
    vi.spyOn(useAuthStore(), 'logout').mockRejectedValue(new Error('offline'))
    const nav = await mountSuspended(AppNav)
    await nav.get('[data-test="nav-user"]').trigger('click')
    await nav.get('[data-test="nav-logout"]').trigger('click'); await flushPromises()
    expect(nav.get('dialog[open] [role="alert"]').text()).toBe('Не удалось выйти. Попробуйте ещё раз.')
    expect(navigateToMock).not.toHaveBeenCalled()
    expect(nav.get('[data-test="nav-logout"]').attributes('disabled')).toBeUndefined()
  })
  it('closes the user menu on route changes and on a session change', async () => {
    const nav = await mountSuspended(AppNav)
    await nav.get('[data-test="nav-user"]').trigger('click')
    await nav.get('dialog[open] a[href="/settings/appearance"]').trigger('click'); await flushPromises()
    expect(nav.find('dialog[open]').exists()).toBe(false)
    await nav.get('[data-test="nav-user"]').trigger('click')
    useAuthStore().sessionVersion++; await flushPromises()
    expect(nav.find('dialog[open]').exists()).toBe(false)
  })
})

describe('adaptive mobile navigation', () => {
  function measurements() {
    let height = 338
    const viewport = Object.assign(new EventTarget(), { height: 390 })
    const media = Object.assign(new EventTarget(), { matches: false })
    let resized!: ResizeObserverCallback
    const disconnect = vi.fn()
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { resized = callback }
      observe() {}
      disconnect = disconnect
    })
    vi.spyOn(window, 'matchMedia').mockReturnValue(media as unknown as MediaQueryList)
    vi.stubGlobal('visualViewport', viewport)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ height }) as DOMRect)
    return { viewport, media, disconnect, resize: (value: number) => { height = value; resized([], {} as ResizeObserver) } }
  }
  it('uses normal flow above 40% and restores the overlay on viewport or font changes', async () => {
    const metrics = measurements()
    const resize = vi.fn()
    const nav = await mountSuspended(AppNav, { props: { onResize: resize } })
    expect(nav.emitted('flow')?.at(-1)).toEqual([true])
    expect(nav.emitted('resize')?.at(-1)).toEqual([0])
    expect(nav.classes()).toContain('app-nav--flow')
    metrics.viewport.height = 900
    metrics.viewport.dispatchEvent(new Event('resize')); await flushPromises()
    expect(nav.emitted('flow')?.at(-1)).toEqual([false])
    expect(nav.emitted('resize')?.at(-1)).toEqual([338])
    metrics.viewport.height = 390
    window.dispatchEvent(new Event('resize')); await flushPromises()
    expect(nav.emitted('flow')?.at(-1)).toEqual([true])
    metrics.resize(156); await flushPromises()
    expect(nav.emitted('flow')?.at(-1)).toEqual([false])
    expect(nav.emitted('resize')?.at(-1)).toEqual([156])
    metrics.resize(157); await flushPromises()
    expect(nav.emitted('flow')?.at(-1)).toEqual([true])
    nav.unmount()
    expect(metrics.disconnect).toHaveBeenCalledOnce()
    const count = resize.mock.calls.length
    metrics.viewport.dispatchEvent(new Event('resize'))
    window.dispatchEvent(new Event('resize'))
    expect(resize).toHaveBeenCalledTimes(count)
  })
  it('keeps the desktop sidebar out of both mobile modes', async () => {
    const metrics = measurements()
    const nav = await mountSuspended(AppNav)
    await nav.get('[data-test=nav-more]').trigger('click')
    metrics.media.matches = true
    metrics.media.dispatchEvent(new Event('change')); await flushPromises()
    expect(nav.emitted('flow')?.at(-1)).toEqual([false])
    expect(nav.emitted('resize')?.at(-1)).toEqual([0])
    expect(nav.find('dialog[open]').exists()).toBe(false)
    metrics.media.matches = false
    metrics.media.dispatchEvent(new Event('change')); await flushPromises()
    expect(nav.emitted('flow')?.at(-1)).toEqual([true])
  })
})
