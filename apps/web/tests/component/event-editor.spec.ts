// @vitest-environment nuxt
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import EventEditor from '~/components/calendar/EventEditor.vue'
import CancelEventDialog from '~/components/calendar/CancelEventDialog.vue'
import { useSettingsStore } from '~/stores/settings'
import { grantPermissions } from '../support/permissions'
const { get, post, patch } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }))
mockNuxtImport('useApi', () => () => ({ get, post, patch }))
enableAutoUnmount(afterEach)
beforeEach(() => {
  vi.clearAllMocks(); grantPermissions({ global: ['calendar.church.manage'] })
  useSettingsStore().apply({ church_name: 'Церковь', timezone: 'Europe/Berlin' } as never)
  get.mockResolvedValue({ data: [] }); post.mockResolvedValue({ data: { id: 'e1' } }); patch.mockResolvedValue({ data: { id: 'e1' } })
})
it('creates in church time with notify off by default', async () => {
  const w = await mountSuspended(EventEditor)
  await w.get('[data-test="title"]').setValue('Собрание')
  await w.get('[data-test="starts-at"]').setValue('2026-07-07T18:00')
  await w.get('[data-test="ends-at"]').setValue('2026-07-07T19:00')
  await w.get('form').trigger('submit'); await flushPromises()
  expect(post).toHaveBeenCalledWith('/events', expect.objectContaining({ starts_at: '2026-07-07T16:00:00.000Z', notify: 'none' }))
})
it('blocks free slots without labels', async () => {
  const w = await mountSuspended(EventEditor)
  await w.get('[data-test="add-slot"]').trigger('click')
  await w.get('form').trigger('submit')
  expect(w.text()).toContain('Свободному слоту нужна подпись'); expect(post).not.toHaveBeenCalled()
})
it('blocks save while church timezone is unavailable and permits retry', async () => {
  useSettingsStore().reset(); get.mockRejectedValue(new Error('offline'))
  const w = await mountSuspended(EventEditor)
  await w.get('form').trigger('submit')
  expect(post).not.toHaveBeenCalled(); expect(w.text()).toContain('часовой пояс')
})
it('cancels only on confirmation', async () => {
  const w = await mountSuspended(CancelEventDialog, { props: { eventId: 'e1' } })
  await w.get('[data-test="reason"]').setValue('Погода'); expect(post).not.toHaveBeenCalled()
  await w.get('[data-test="confirm-cancel"]').trigger('click')
  expect(post).toHaveBeenCalledWith('/events/e1/cancel', { reason: 'Погода' })
})

it('patches cancelled event location only, retains other editor attachments and freezes time', async () => {
  const event = { id: 'e1', owner_type: 'church', ministry: null, title: 'Событие', description: null, location: 'Зал', starts_at: '2026-07-07T16:00:23Z', ends_at: '2026-07-07T17:00:23Z', visibility: 'church', status: 'cancelled', can_manage: true, attachments: [{ id: 'old', kind: 'file', url: '/old', thumb_url: null, status: 'ready' }], slots: [] }
  grantPermissions()
  const w = await mountSuspended(EventEditor, { props: { event: event as never } })
  expect(w.get('[data-test="starts-at"]').attributes('disabled')).toBeDefined()
  await w.get('[data-test="location"]').setValue('Другой зал')
  await w.get('form').trigger('submit'); await flushPromises()
  expect(patch).toHaveBeenLastCalledWith('/events/e1', { location: 'Другой зал' })
  await w.get('[data-test="remove-media-old"]').trigger('click')
  await w.get('form').trigger('submit'); await flushPromises()
  expect(patch).toHaveBeenLastCalledWith('/events/e1', { location: 'Другой зал', media_ids: [] })
})
it('offers only manageable owners and sends roles with notification explicitly selected', async () => {
  grantPermissions({ ministries: { m1: ['events.manage'] } })
  get.mockImplementation((url: string) => Promise.resolve({ data: url === '/ministries' ? [{ id: 'm1', name: 'Первое' }, { id: 'm2', name: 'Второе' }] : [{ id: 'm2', name: 'Второе', roles: [{ id: 'r1', name: 'Вокалист' }] }] }))
  const w = await mountSuspended(EventEditor, { props: { defaultOwner: { type: 'ministry', ministryId: 'm1' } } })
  expect(w.findAll('[data-test="owner-option"]').map(o => o.text())).toEqual(['Первое'])
  await w.get('[data-test="title"]').setValue('Репетиция')
  await w.get('[data-test="starts-at"]').setValue('2026-07-07T18:00')
  await w.get('[data-test="ends-at"]').setValue('2026-07-07T19:00')
  await w.get('[data-test="add-slot"]').trigger('click')
  await w.get('[data-test="slot-0-role"]').setValue('r1')
  await w.get('[data-test="notify"]').setValue(true)
  await w.get('form').trigger('submit'); await flushPromises()
  expect(post).toHaveBeenLastCalledWith('/events', expect.objectContaining({ owner_type: 'ministry', ministry_id: 'm1', slots: [{ role_id: 'r1', label: null, required_count: 1 }], notify: 'ministry' }))
})
it('shows domain error messages', async () => {
  post.mockRejectedValue({ statusCode: 422, data: { message: 'Служение этой роли архивировано.' } })
  const w = await mountSuspended(EventEditor)
  await w.get('[data-test="title"]').setValue('Событие')
  await w.get('[data-test="starts-at"]').setValue('2026-07-07T18:00')
  await w.get('[data-test="ends-at"]').setValue('2026-07-07T19:00')
  await w.get('form').trigger('submit'); await flushPromises()
  expect(w.text()).toContain('Служение этой роли архивировано.')
})

it('loads church timezone before the first successful creation', async () => {
  useSettingsStore().reset()
  vi.spyOn(useSettingsStore(), 'fetch').mockImplementation(async () => { useSettingsStore().apply({ church_name: 'Церковь', timezone: 'Europe/Berlin' } as never) })
  get.mockImplementation((url: string) => Promise.resolve({ data: url === '/settings' ? { church_name: 'Церковь', timezone: 'Europe/Berlin' } : [] }))
  const w = await mountSuspended(EventEditor)
  await w.get('[data-test="title"]').setValue('Событие')
  await w.get('[data-test="starts-at"]').setValue('2026-07-07T18:00')
  await w.get('[data-test="ends-at"]').setValue('2026-07-07T19:00')
  await w.get('form').trigger('submit'); await flushPromises()
  expect(post).toHaveBeenCalledWith('/events', expect.objectContaining({ starts_at: '2026-07-07T16:00:00.000Z' }))
})
