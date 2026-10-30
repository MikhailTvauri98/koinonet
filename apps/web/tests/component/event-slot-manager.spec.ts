// @vitest-environment nuxt
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import EventSlotManager from '~/components/calendar/EventSlotManager.vue'
import { grantPermissions } from '../support/permissions'
const { get, post, patch, remove } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), remove: vi.fn() }))
mockNuxtImport('useApi', () => () => ({ get, post, patch, delete: remove }))
enableAutoUnmount(afterEach)
const slot = { id: 's1', label: 'Помощник', role: null, required_count: 2, can_fill: true, assignments: [] }
const event = { id: 'e1', owner_type: 'church', ministry: null, status: 'scheduled', can_manage: true, slots: [slot] }
beforeEach(() => { vi.clearAllMocks(); grantPermissions(); get.mockResolvedValue({ data: [] }); patch.mockResolvedValue({}); post.mockResolvedValue({}); remove.mockResolvedValue({}) })
it('changes a slot separately and confirms removing its assignments', async () => {
  const w = await mountSuspended(EventSlotManager, { props: { event: event as never } })
  await w.get('[data-test="edit-slot-s1"]').trigger('click'); await flushPromises()
  await w.get('[data-test="slot-0-count"]').setValue('3')
  await w.get('[data-test="save-slot"]').trigger('click'); await flushPromises()
  expect(patch).toHaveBeenCalledWith('/slots/s1', { label: 'Помощник', role_id: null, required_count: 3 })
  await w.findAll('button').find(b => b.text() === 'Убрать слот')!.trigger('click')
  expect(remove).not.toHaveBeenCalled()
  await w.get('[data-test="confirm-remove-slot"]').trigger('click'); await flushPromises()
  expect(remove).toHaveBeenCalledWith('/slots/s1'); expect(w.emitted('saved')).toHaveLength(2)
})
it.each([{ ...event, can_manage: false }, { ...event, status: 'cancelled' }])('does not offer structural writes without live management capability', async (item) => {
  const w = await mountSuspended(EventSlotManager, { props: { event: item as never } })
  expect(w.find('button').exists()).toBe(false)
})
