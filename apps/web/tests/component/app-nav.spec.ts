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

mockNuxtImport('useApi', () => () => ({ get: vi.fn().mockResolvedValue({ data: [] }) }))
enableAutoUnmount(afterEach)
beforeEach(() => { grantPermissions(); vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) { this.open = true }); vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) { this.open = false }) })
afterEach(() => vi.restoreAllMocks())
async function openMore() {
  const nav = await mountSuspended(AppNav)
  await nav.get('[data-test="nav-more"]').trigger('click')
  return nav
}
describe('phone navigation', () => {
  it('opens always available secondary sections without granting forbidden links', async () => {
    const nav = await openMore()
    const dialog = nav.get('dialog[open]')
    expect(dialog.findAll('a').map(a => a.text())).toEqual(['Объявления', 'Профиль'])
    expect(dialog.attributes('aria-label')).toBe('Ещё')
  })
  it('includes every permitted secondary destination with all permissions', async () => {
    grantPermissions({ administrator: true })
    const nav = await openMore()
    expect(nav.get('dialog[open]').findAll('a').map(a => a.attributes('href'))).toEqual(['/people', '/ministries', '/templates', '/announcements', '/settings/profile', '/admin/roles', '/admin/settings', '/admin/audit'])
  })
  it('includes ministry-only management without exposing global administration', async () => {
    grantPermissions({ ministries: { m1: ['events.manage'] } })
    const nav = await openMore()
    expect(nav.get('dialog[open]').findAll('a').map(a => a.attributes('href'))).toEqual(['/ministries', '/templates', '/announcements', '/settings/profile'])
  })
  it('closes on permission revocation and recomputes available destinations', async () => {
    grantPermissions({ administrator: true })
    const nav = await openMore()
    grantPermissions(); await flushPromises()
    expect(nav.find('dialog[open]').exists()).toBe(false)
    await nav.get('[data-test="nav-more"]').trigger('click')
    expect(nav.get('dialog[open]').findAll('a').map(a => a.text())).toEqual(['Объявления', 'Профиль'])
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
})
