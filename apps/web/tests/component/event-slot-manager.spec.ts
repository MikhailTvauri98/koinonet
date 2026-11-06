// @vitest-environment nuxt
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import EventSlotManager from '~/components/calendar/EventSlotManager.vue'
import { grantPermissions } from '../support/permissions'
import { useAuthStore } from '~/stores/auth'
const { get, post, patch, remove } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), remove: vi.fn() }))
mockNuxtImport('useApi', () => () => ({ get, post, patch, delete: remove }))
enableAutoUnmount(afterEach)
const slot = { id: 's1', label: 'Помощник', role: null, required_count: 2, can_fill: true, assignments: [] }
const event = { id: 'e1', owner_type: 'church', ministry: null, status: 'scheduled', can_manage: true, slots: [slot] }
beforeEach(() => { vi.clearAllMocks(); grantPermissions(); get.mockResolvedValue({ data: [] }); patch.mockResolvedValue({}); post.mockResolvedValue({}); remove.mockResolvedValue({}) })
it('edits an explicitly selected slot without rendering a duplicate roster, and confirms its removal', async () => {
  const w = await mountSuspended(EventSlotManager, { props: { event: event as never, slot: slot as never, mode: 'edit' } })
  await flushPromises()
  expect(w.findAll('[data-test="edit-slot-s1"]')).toHaveLength(0)
  await w.get('[data-test="slot-0-count"]').setValue('3')
  await w.get('[data-test="save-slot"]').trigger('click'); await flushPromises()
  expect(patch).toHaveBeenCalledWith('/slots/s1', { label: 'Помощник', role_id: null, required_count: 3 })
  await w.setProps({ mode: 'remove' })
  expect(remove).not.toHaveBeenCalled()
  await w.get('[data-test="confirm-remove-slot"]').trigger('click'); await flushPromises()
  expect(remove).toHaveBeenCalledWith('/slots/s1'); expect(w.emitted('saved')).toHaveLength(2)
})
it.each([{ ...event, can_manage: false }, { ...event, status: 'cancelled' }])('does not offer structural writes without live management capability', async (item) => {
  const w = await mountSuspended(EventSlotManager, { props: { event: item as never, slot: slot as never, mode: 'edit' } })
  expect(w.find('button').exists()).toBe(false)
})
it('preserves allowed input on an unrelated permissions refresh, then closes and ignores late data on revocation', async () => {
  grantPermissions({ global: ['calendar.church.manage'] })
  let finish!: (value: unknown) => void
  get.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const w = await mountSuspended(EventSlotManager, { props: { event: event as never, slot: slot as never, mode: 'edit' } })
  await w.get('[data-test="slot-0-count"]').setValue('4')
  grantPermissions({ global: ['calendar.church.manage', 'people.view'] }); await flushPromises()
  expect(w.get('[data-test="slot-0-count"]').element).toHaveProperty('value', '4')
  grantPermissions(); await flushPromises()
  finish({ data: [{ id: 'secret', name: 'Скрытое', roles: [] }] }); await flushPromises()
  expect(w.find('[data-test="save-slot"]').exists()).toBe(false)
  expect(w.emitted('close')).toBeTruthy()
  expect(w.text()).not.toContain('Скрытое')
})
it('ignores a late successful write after session changes', async () => {
  let finish!: (value: unknown) => void
  patch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const w = await mountSuspended(EventSlotManager, { props: { event: event as never, slot: slot as never, mode: 'edit' } })
  await flushPromises(); await w.get('[data-test="save-slot"]').trigger('click')
  useAuthStore().sessionVersion++; await flushPromises()
  finish({}); await flushPromises()
  expect(w.emitted('saved')).toBeUndefined()
  expect(w.find('[data-test="save-slot"]').exists()).toBe(false)
})
it('keeps draft when a rights refresh replaces the event and selected slot with the same identities', async () => {
  const w = await mountSuspended(EventSlotManager, { props: { event: event as never, slot: slot as never, mode: 'edit' } })
  await flushPromises()
  await w.get('[data-test="slot-0-count"]').setValue('5')
  await w.setProps({ event: { ...event } as never, slot: { ...slot } as never })
  await flushPromises()
  expect(w.get('[data-test="slot-0-count"]').element).toHaveProperty('value', '5')
})
it('retains an in-flight successful PATCH across a same-event permissions read', async () => {
  let finish!: (value: unknown) => void
  patch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const w = await mountSuspended(EventSlotManager, { props: { event: event as never, slot: slot as never, mode: 'edit' } })
  await flushPromises(); await w.get('[data-test="slot-0-count"]').setValue('5')
  await w.get('[data-test="save-slot"]').trigger('click')
  await w.setProps({ event: { ...event } as never, slot: { ...slot } as never }); await flushPromises()
  finish({}); await flushPromises()
  expect(w.emitted('saved')).toHaveLength(1)
  expect(patch).toHaveBeenCalledTimes(1)
})
