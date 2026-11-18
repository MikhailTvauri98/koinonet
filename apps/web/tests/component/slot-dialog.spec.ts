// @vitest-environment nuxt
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import SlotDialog from '~/components/calendar/SlotDialog.vue'
import SlotList from '~/components/calendar/SlotList.vue'
import EventPage from '~/pages/events/[id].vue'
import type { EventItem, EventSlot } from '~/composables/useEvents'
import { useAuthStore } from '~/stores/auth'
import { useSettingsStore } from '~/stores/settings'
import { grantPermissions } from '../support/permissions'

const { get, post, patch, remove } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), remove: vi.fn() }))
mockNuxtImport('useApi', () => () => ({ get, post, patch, delete: remove }))
mockNuxtImport('useRoute', () => () => ({ params: { id: 'e1' }, query: {} }))
enableAutoUnmount(afterEach)
const person = (id: string, full: string | null, short: string | null = full) => ({ id, full_name: full, short_name: short, photo_thumb_url: null })
const anna = { id: 'a1', person: person('p1', 'Анна Иванова', 'Анна И.'), created_at: '2026-11-08T07:00:00Z' }
const boris = { id: 'a2', person: person('p2', 'Борис Петров', 'Борис П.'), created_at: '2026-11-08T07:00:00Z' }
const slotOf = (over: Partial<EventSlot> = {}): EventSlot => ({ id: 's1', label: 'Вокалист', resource_type: 'person', role: { id: 'r1', name: 'Вокалист', ministry_id: 'm1' }, required_count: 3, filled_count: 2, sort_order: 0, can_fill: true, assignments: [anna, boris], ...over })
const eventOf = (slot: EventSlot = slotOf(), over: Partial<EventItem> = {}): EventItem => ({ id: 'e1', chat_id: null, owner_type: 'church', ministry: null, template_id: null, occurrence_date: null, title: 'Событие', description: null, location: null, starts_at: '2026-11-08T07:00:00Z', ends_at: '2026-11-08T09:00:00Z', visibility: 'church', status: 'scheduled', cancelled_at: null, cancel_reason: null, can_manage: false, attachments: [], slots: [slot], ...over })
const mountDialog = (event: EventItem, slot = event.slots[0]!, props: Record<string, unknown> = {}) => mountSuspended(SlotDialog, { props: { event, slot, ...props } })
const buttonTexts = (w: { findAll: (s: string) => { text: () => string }[] }) => w.findAll('button').map(b => b.text())
beforeEach(() => {
  vi.resetAllMocks(); grantPermissions()
  useSettingsStore().apply({ church_name: 'Церковь', timezone: 'Europe/Moscow' } as never)
  get.mockResolvedValue({ data: [] }); post.mockResolvedValue({ data: anna, warnings: [] }); remove.mockResolvedValue(undefined); patch.mockResolvedValue({})
})

// Row
it('renders a slot as one compact row: title, "2 из 3", avatars and short names, quiet "+ Назначить"', async () => {
  const w = await mountSuspended(SlotList, { props: { slots: [slotOf()] } })
  const row = w.get('.slot')
  expect(row.text()).toContain('Вокалист'); expect(w.get('[data-test="slot-s1-count"]').text()).toBe('2 из 3')
  expect(row.text()).toContain('Анна И.'); expect(row.text()).toContain('Борис П.'); expect(row.text()).not.toContain('Анна Иванова')
  expect(row.findAll('.ui-avatar')).toHaveLength(2)
  expect(w.get('[data-test="assign-s1"]').classes()).toContain('ui-button--quiet'); expect(w.get('[data-test="assign-s1"]').text()).toBe('+ Назначить')
  expect(w.find('.ui-button--danger').exists()).toBe(false)
  expect(w.find('[data-test="remove-assignment-a1"]').exists()).toBe(false); expect(w.find('[data-test="edit-slot-s1"]').exists()).toBe(false)
})
it('labels an empty slot and overfill with text, and hides "+ Назначить" without a free place or can_fill', async () => {
  const w = await mountSuspended(SlotList, { props: { slots: [slotOf({ filled_count: 0, assignments: [] })] } })
  expect(w.get('.slot').text()).toContain('Никто не назначен')
  await w.setProps({ slots: [slotOf({ required_count: 1, filled_count: 2 })] })
  expect(w.get('.slot').text()).toContain('Сверх нормы: 1'); expect(w.get('[data-test="slot-s1-count"]').text()).toBe('2 из 1')
  expect(w.find('[data-test="assign-s1"]').exists()).toBe(false)
  await w.setProps({ slots: [slotOf({ can_fill: false })] })
  expect(w.find('[data-test="assign-s1"]').exists()).toBe(false)
})
it('makes the row a button only with can_fill or management; the quiet button opens assignment directly', async () => {
  const w = await mountSuspended(SlotList, { props: { slots: [slotOf({ can_fill: false })] } })
  expect(w.find('button').exists()).toBe(false)
  await w.setProps({ canManage: true })
  await w.get('[data-test="slot-row-s1"]').trigger('click')
  expect(w.emitted('open')?.[0]?.[0]).toMatchObject({ id: 's1' })
  await w.setProps({ canManage: false, slots: [slotOf()] })
  await w.get('[data-test="assign-s1"]').trigger('click')
  expect(w.emitted('assign')?.[0]?.[0]).toMatchObject({ id: 's1' }); expect(w.emitted('open')).toHaveLength(1)
})
it('marks the signed-in person with text and keeps hidden names neutral without a photo', async () => {
  const mine = { id: 'a3', person: { ...person('p-signed-in', 'Тест Вошедший', 'Тест В.'), photo_thumb_url: '/mine.jpg' }, created_at: null }
  const hidden = { id: 'a4', person: { ...person('p9', null), photo_thumb_url: '/private.jpg' }, created_at: null }
  const w = await mountSuspended(SlotList, { props: { slots: [slotOf({ assignments: [mine, hidden], filled_count: 2 })] } })
  expect(w.get('.slot').text()).toContain('вы'); expect(w.get('.slot').text()).toContain('Имя скрыто')
  expect(w.findAll('img').map(img => img.attributes('src'))).toEqual(['/mine.jpg'])
})

it('gives the row a dialog popup hint and each name once in its accessible text', async () => {
  const w = await mountSuspended(SlotList, { props: { slots: [slotOf()] } })
  const row = w.get('[data-test="slot-row-s1"]')
  expect(row.attributes('aria-haspopup')).toBe('dialog')
  expect(row.findAll('[aria-label]')).toHaveLength(0); expect(row.findAll('[role="img"]')).toHaveLength(0)
  expect(row.text().split('Анна И.')).toHaveLength(2); expect(row.text().split('Борис П.')).toHaveLength(2)
})

// Dialog actions by flags
it('a can_fill-only person sees assign (also when full) and remove-assignment, but not edit/remove slot', async () => {
  const w = await mountDialog(eventOf(slotOf({ required_count: 2 })))
  expect(buttonTexts(w)).toEqual(expect.arrayContaining(['Назначить', 'Снять назначение']))
  expect(buttonTexts(w)).not.toContain('Изменить слот'); expect(buttonTexts(w)).not.toContain('Убрать слот')
  expect(w.findAll('[data-test^="remove-assignment-"]')).toHaveLength(2)
  expect(w.find('.ui-button--danger').exists()).toBe(false)
})
it('a manager sees all four actions, with no danger button outside confirmations', async () => {
  const w = await mountDialog(eventOf(slotOf(), { can_manage: true }))
  expect(buttonTexts(w)).toEqual(expect.arrayContaining(['Назначить', 'Снять назначение', 'Изменить слот', 'Убрать слот']))
  expect(w.find('.ui-button--danger').exists()).toBe(false)
})
it('a manager without can_fill sees structure only; a cancelled event offers no structural action', async () => {
  const w = await mountDialog(eventOf(slotOf({ can_fill: false }), { can_manage: true }))
  expect(buttonTexts(w)).toEqual(expect.arrayContaining(['Изменить слот', 'Убрать слот'])); expect(buttonTexts(w)).not.toContain('Назначить'); expect(buttonTexts(w)).not.toContain('Снять назначение')
  const cancelled = await mountDialog(eventOf(slotOf({ can_fill: false }), { can_manage: true, status: 'cancelled' }))
  expect(buttonTexts(cancelled)).not.toContain('Изменить слот')
})
it('shows full roster names and "Никто не назначен" in the dialog, short names with avatars', async () => {
  const w = await mountDialog(eventOf(slotOf({ filled_count: 0, assignments: [] })))
  expect(w.text()).toContain('Никто не назначен')
  await w.setProps({ slot: slotOf() })
  expect(w.text()).toContain('Анна И.'); expect(w.findAll('.ui-avatar')).toHaveLength(2)
})

// Confirmations
it('removing an assignment asks for confirmation, keeps the roster on failure and emits assignmentsChanged after DELETE', async () => {
  const w = await mountDialog(eventOf())
  await w.get('[data-test="remove-assignment-a1"]').trigger('click'); expect(remove).not.toHaveBeenCalled()
  await w.get('[data-test="cancel-remove-assignment"]').trigger('click'); expect(remove).not.toHaveBeenCalled()
  await w.get('[data-test="remove-assignment-a1"]').trigger('click')
  expect(w.get('[data-test="confirm-remove-assignment"]').classes()).toContain('ui-button--danger')
  remove.mockRejectedValueOnce({ statusCode: 422, data: { message: 'Назначения отменённого события изменить нельзя.' } })
  await w.get('[data-test="confirm-remove-assignment"]').trigger('click'); await flushPromises()
  expect(w.text()).toContain('отменённого события'); expect(w.emitted('assignmentsChanged')).toBeUndefined()
  await w.get('[data-test="confirm-remove-assignment"]').trigger('click'); await flushPromises()
  expect(remove).toHaveBeenLastCalledWith('/assignments/a1'); expect(w.emitted('assignmentsChanged')).toHaveLength(1)
  expect(w.get('[data-test="remove-assignment-a1"]').text()).toBe('Назначение снято'); expect(w.get('[data-test="remove-assignment-a1"]').attributes('disabled')).toBeDefined()
})
it('moves focus inside the dialog after a successful removal and names the person fully in the confirmation', async () => {
  const w = await mountSuspended(SlotDialog, { props: { event: eventOf(), slot: slotOf() }, attachTo: document.body })
  await w.get('[data-test="remove-assignment-a1"]').trigger('click')
  expect(document.body.textContent).toContain('Анна Иванова · Вокалист')
  await w.get('[data-test="confirm-remove-assignment"]').trigger('click'); await flushPromises()
  const dialog = w.get('dialog').element
  expect(dialog.contains(document.activeElement)).toBe(true); expect(document.activeElement).not.toBe(document.body)
  const hidden = slotOf({ assignments: [{ id: 'a3', person: person('p9', null), created_at: null }], filled_count: 1 })
  const second = await mountSuspended(SlotDialog, { props: { event: eventOf(hidden), slot: hidden }, attachTo: document.body })
  await second.get('[data-test="remove-assignment-a3"]').trigger('click')
  expect(document.body.textContent).toContain('Участник · Вокалист')
})
it('removing the slot goes through the confirmation of the slot manager and emits slotRemoved', async () => {
  const event = eventOf(slotOf(), { can_manage: true }); grantPermissions({ global: ['calendar.church.manage'] })
  const w = await mountDialog(event)
  await w.get('[data-test="remove-slot-s1"]').trigger('click'); await flushPromises()
  expect(remove).not.toHaveBeenCalled()
  expect(w.get('[data-test="confirm-remove-slot"]').classes()).toContain('ui-button--danger')
  await w.get('[data-test="confirm-remove-slot"]').trigger('click'); await flushPromises()
  expect(remove).toHaveBeenCalledWith('/slots/s1'); expect(w.emitted('slotRemoved')).toHaveLength(1)
})
it('editing the slot opens the slot manager and emits slotChanged once after a single PATCH', async () => {
  const event = eventOf(slotOf(), { can_manage: true }); grantPermissions({ global: ['calendar.church.manage'] })
  const w = await mountDialog(event)
  await w.get('[data-test="edit-slot-s1"]').trigger('click'); await flushPromises()
  await w.get('[data-test="slot-0-count"]').setValue('4')
  await w.get('[data-test="save-slot"]').trigger('click'); await flushPromises()
  expect(patch).toHaveBeenCalledTimes(1); expect(w.emitted('slotChanged')).toHaveLength(1)
  expect(w.find('[data-test="save-slot"]').exists()).toBe(false)
})
it('the dialog assign button opens the candidate dialog and reports a created assignment', async () => {
  get.mockResolvedValue({ data: [{ person: person('p3', 'Вера Смирнова', 'Вера С.'), has_role: true, conflicts: [] }] })
  const w = await mountDialog(eventOf())
  await w.get('[data-test="dialog-assign-s1"]').trigger('click'); await flushPromises()
  expect(w.get('[data-test="candidate-p3"]').text()).toContain('Вера Смирнова')
  await w.get('[data-test="candidate-p3"]').trigger('click'); await flushPromises()
  expect(post).toHaveBeenCalledWith('/slots/s1/assignments', { person_id: 'p3' }); expect(w.emitted('assignmentsChanged')).toHaveLength(1)
})

// Revocation, session, late responses
it('closes when the slot loses both flags and when the session changes', async () => {
  const w = await mountDialog(eventOf(slotOf(), { can_manage: false }))
  await w.setProps({ slot: slotOf({ can_fill: false }) }); await flushPromises()
  expect(w.emitted('close')).toHaveLength(1)
  const second = await mountDialog(eventOf())
  useAuthStore().sessionVersion++; await flushPromises()
  expect(second.emitted('close')).toBeTruthy()
})
it('ignores a late removal response after the session changed', async () => {
  let finish!: () => void
  remove.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
  const w = await mountDialog(eventOf())
  await w.get('[data-test="remove-assignment-a1"]').trigger('click'); await w.get('[data-test="confirm-remove-assignment"]').trigger('click')
  useAuthStore().sessionVersion++; await flushPromises(); finish(); await flushPromises()
  expect(w.emitted('assignmentsChanged')).toBeUndefined()
})
it('ignores a late assignment response after the dialog lost can_fill', async () => {
  let finish!: (value: unknown) => void
  get.mockResolvedValue({ data: [{ person: person('p3', 'Вера Смирнова', 'Вера С.'), has_role: true, conflicts: [] }] })
  post.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const w = await mountDialog(eventOf())
  await w.get('[data-test="dialog-assign-s1"]').trigger('click'); await flushPromises()
  await w.get('[data-test="candidate-p3"]').trigger('click')
  await w.setProps({ slot: slotOf({ can_fill: false }) }); await flushPromises()
  finish({ data: anna, warnings: [] }); await flushPromises()
  expect(w.emitted('assignmentsChanged')).toBeUndefined(); expect(w.emitted('close')).toBeTruthy()
})
it('revoking can_fill on the event page closes the open slot dialog', async () => {
  grantPermissions({ global: ['calendar.church.manage', 'people.view'] })
  get.mockResolvedValue({ data: eventOf(slotOf(), { can_manage: true }) })
  const w = await mountSuspended(EventPage)
  await w.get('[data-test="slot-row-s1"]').trigger('click'); await flushPromises()
  expect(w.find('[data-test="dialog-assign-s1"]').exists()).toBe(true)
  grantPermissions({ global: ['people.view'] }); await flushPromises()
  expect(w.find('[data-test="dialog-assign-s1"]').exists()).toBe(false); expect(w.find('[data-test="edit-slot-s1"]').exists()).toBe(false)
})
it('a successful write with a failed re-read is reported inside the dialog and never repeated', async () => {
  get.mockResolvedValueOnce({ data: eventOf(slotOf(), { can_manage: false }) })
  const w = await mountSuspended(EventPage)
  await w.get('[data-test="slot-row-s1"]').trigger('click'); await flushPromises()
  await w.get('[data-test="remove-assignment-a1"]').trigger('click')
  get.mockRejectedValueOnce(new Error('offline'))
  await w.get('[data-test="confirm-remove-assignment"]').trigger('click'); await flushPromises()
  expect(remove).toHaveBeenCalledTimes(1); expect(w.text()).toContain('Изменение сохранено, но'); expect(w.text()).toContain('Закройте окно')
  expect(w.get('[data-test="remove-assignment-a1"]').attributes('disabled')).toBeDefined()
  expect(w.get('[data-test="remove-assignment-a2"]').attributes('disabled')).toBeDefined()
  expect(w.find('[data-test="confirm-remove-assignment"]').exists()).toBe(false)
  await w.get('[data-test="remove-assignment-a2"]').trigger('click'); await flushPromises()
  expect(w.find('[data-test="confirm-remove-assignment"]').exists()).toBe(false); expect(remove).toHaveBeenCalledTimes(1)
})
