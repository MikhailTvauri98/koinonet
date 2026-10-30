// @vitest-environment nuxt
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import AssignDialog from '~/components/calendar/AssignDialog.vue'
import SlotList from '~/components/calendar/SlotList.vue'
import EventPage from '~/pages/events/[id].vue'
import type { EventItem, EventSlot } from '~/composables/useEvents'
import type { components } from '~~/types/api'
import { useSettingsStore } from '~/stores/settings'
import { grantPermissions } from '../support/permissions'

const { get, post, remove } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), remove: vi.fn() }))
mockNuxtImport('useApi', () => () => ({ get, post, delete: remove }))
mockNuxtImport('useRoute', () => () => ({ params: { id: 'e1' }, query: {} }))
enableAutoUnmount(afterEach)
afterEach(() => vi.useRealTimers())
type Candidate = components['schemas']['CandidateResource']
const candidate = (id = 'p1', name: string | null = 'Анна'): Candidate => ({ person: { id, full_name: name, photo_thumb_url: null }, has_role: true, conflicts: [] })
const roleSlot = (): EventSlot => ({ id: 's1', label: 'Вокалист', resource_type: 'person', role: { id: 'r1', name: 'Вокалист', ministry_id: 'm1' }, required_count: 2, filled_count: 0, sort_order: 0, can_fill: true, assignments: [] })
const freeSlot = (): EventSlot => ({ ...roleSlot(), id: 's2', role: null, label: 'Встречающий' })
const assignment = { id: 'a1', person: candidate().person, created_at: '2026-11-08T07:00:00Z' }
const event = (slot: EventSlot): EventItem => ({ id: 'e1', owner_type: 'church', ministry: null, template_id: null, occurrence_date: null, title: 'Событие', description: null, location: null, starts_at: '2026-11-08T07:00:00Z', ends_at: '2026-11-08T09:00:00Z', visibility: 'church', status: 'scheduled', cancelled_at: null, cancel_reason: null, can_manage: false, attachments: [], slots: [slot] })
beforeEach(() => {
  vi.resetAllMocks(); grantPermissions()
  useSettingsStore().apply({ church_name: 'Церковь', timezone: 'Europe/Moscow' } as never)
  get.mockResolvedValue({ data: [candidate()] }); post.mockResolvedValue({ data: assignment, warnings: [] }); remove.mockResolvedValue(undefined)
})

it('loads role candidates immediately, shows church-time conflicts and filters names locally', async () => {
  get.mockResolvedValue({ data: [candidate(), { ...candidate('p2', 'Мария'), conflicts: [{ event_id: 'e9', title: 'Репетиция', starts_at: '2026-11-08T08:00:00Z', ends_at: '2026-11-08T09:00:00Z' }] }] })
  const w = await mountSuspended(AssignDialog, { props: { slot: roleSlot() } }); await flushPromises()
  expect(get).toHaveBeenCalledWith('/slots/s1/candidates', expect.anything())
  expect(w.get('[data-test="candidate-p2"]').text()).toContain('Репетиция')
  expect(w.get('[data-test="candidate-p2"]').text()).toContain('11:00')
  expect(w.find('[data-test="candidate-p1"] [data-test="conflict"]').exists()).toBe(false)
  await w.get('[data-test="search"]').setValue('мар')
  expect(w.find('[data-test="candidate-p1"]').exists()).toBe(false); expect(get).toHaveBeenCalledTimes(1)
})
it('renders hidden identities and intersections without links, times or lookup requests', async () => {
  get.mockResolvedValue({ data: [{ ...candidate('private', null), conflicts: [{ event_id: null, title: 'Пересечение с недоступным событием', starts_at: null, ends_at: null }] }] })
  const w = await mountSuspended(AssignDialog, { props: { slot: roleSlot() } }); await flushPromises()
  expect(w.text()).toContain('Имя скрыто'); expect(w.text()).toContain('Пересечение с недоступным событием')
  expect(w.find('a').exists()).toBe(false); expect(w.find('time').exists()).toBe(false); expect(w.find('img').exists()).toBe(false)
  await w.get('[data-test="search"]').setValue('а'); expect(w.find('[data-test="candidate-private"]').exists()).toBe(false)
  expect(get).toHaveBeenCalledTimes(1)
})
it('debounces free search at two trimmed characters and clears short searches', async () => {
  const w = await mountSuspended(AssignDialog, { props: { slot: freeSlot() } }); vi.useFakeTimers()
  expect(get).not.toHaveBeenCalled()
  await w.get('[data-test="search"]').setValue(' а '); await vi.advanceTimersByTimeAsync(300); expect(get).not.toHaveBeenCalled()
  await w.get('[data-test="search"]').setValue(' ан '); await vi.advanceTimersByTimeAsync(299); expect(get).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1); expect(get).toHaveBeenCalledWith('/slots/s2/candidates', { search: 'ан' })
  expect(w.find('[data-test="candidate-p1"]').exists()).toBe(true)
  await w.get('[data-test="search"]').setValue('а'); expect(w.find('[data-test="candidate-p1"]').exists()).toBe(false)
})
it('ignores slow prior queries and cancels pending searches on unmount', async () => {
  let old!: (value: unknown) => void
  get.mockImplementationOnce(() => new Promise(resolve => { old = resolve })).mockResolvedValueOnce({ data: [candidate('new', 'Новое имя')] })
  const w = await mountSuspended(AssignDialog, { props: { slot: freeSlot() } }); vi.useFakeTimers()
  await w.get('[data-test="search"]').setValue('ан'); await vi.advanceTimersByTimeAsync(300)
  await w.get('[data-test="search"]').setValue('но'); await vi.advanceTimersByTimeAsync(300)
  old({ data: [candidate('old', 'Старое имя')] }); await vi.advanceTimersByTimeAsync(0)
  expect(w.text()).toContain('Новое имя'); expect(w.text()).not.toContain('Старое имя')
  await w.get('[data-test="search"]').setValue('ещё'); w.unmount(); await vi.advanceTimersByTimeAsync(300)
  expect(get).toHaveBeenCalledTimes(2)
})
it('assigns once and retains success warnings across a same-slot roster refresh', async () => {
  const warnings = [{ code: 'over_capacity', message: 'Слот заполнен сверх нормы.' }, { code: 'time_conflict', message: 'У человека есть пересечение с другим событием.', event_ids: [] }]
  let finish!: (value: unknown) => void
  post.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const w = await mountSuspended(AssignDialog, { props: { slot: roleSlot() } }); await flushPromises()
  await w.get('[data-test="candidate-p1"]').trigger('click'); await w.get('[data-test="candidate-p1"]').trigger('click')
  expect(post).toHaveBeenCalledTimes(1); expect(post).toHaveBeenCalledWith('/slots/s1/assignments', { person_id: 'p1' })
  finish({ data: assignment, warnings }); await flushPromises()
  await w.setProps({ slot: { ...roleSlot(), filled_count: 1, assignments: [assignment] } })
  expect(w.get('[data-test="warnings"]').text()).toContain('сверх нормы'); expect(w.get('[data-test="warnings"]').text()).toContain('пересечение')
  expect(w.text()).toContain('Назначение создано'); expect(w.emitted('assigned')).toEqual([[assignment, warnings]])
  expect(w.emitted('close')).toBeUndefined(); expect(w.get('[data-test="candidate-p1"]').attributes('disabled')).toBeDefined()
})
it('shows known conflict titles and role warning but never fetches unknown warning IDs', async () => {
  get.mockResolvedValue({ data: [{ ...candidate(), conflicts: [{ event_id: 'e9', title: 'Репетиция', starts_at: '2026-11-08T08:00:00Z', ends_at: '2026-11-08T09:00:00Z' }] }] })
  post.mockResolvedValue({ data: assignment, warnings: [{ code: 'role_mismatch', message: 'Нет требуемой роли.' }, { code: 'time_conflict', message: 'Есть пересечение.', event_ids: ['e9', 'unknown'] }] })
  const w = await mountSuspended(AssignDialog, { props: { slot: roleSlot() } }); await flushPromises()
  await w.get('[data-test="candidate-p1"]').trigger('click'); await flushPromises()
  expect(w.get('[data-test="warnings"]').text()).toContain('Вокалист'); expect(w.get('[data-test="warnings"]').text()).toContain('Пересекается с: Репетиция')
  expect(w.get('[data-test="warnings"]').text()).not.toContain('unknown'); expect(get).toHaveBeenCalledTimes(1)
})
it('shows a duplicate domain error and permits retry after failure', async () => {
  post.mockRejectedValueOnce({ statusCode: 422, data: { code: 'assignment.duplicate', message: 'Человек уже назначен в этот слот.' } })
  const w = await mountSuspended(AssignDialog, { props: { slot: roleSlot() } }); await flushPromises()
  await w.get('[data-test="candidate-p1"]').trigger('click'); await flushPromises()
  expect(w.text()).toContain('уже назначен'); expect(w.emitted('assigned')).toBeUndefined()
  await w.get('[data-test="candidate-p1"]').trigger('click'); await flushPromises(); expect(w.emitted('assigned')).toHaveLength(1)
})
it('resets state on slot identity change and ignores old candidate responses', async () => {
  let old!: (value: unknown) => void
  get.mockImplementationOnce(() => new Promise(resolve => { old = resolve }))
  const w = await mountSuspended(AssignDialog, { props: { slot: roleSlot() } })
  await w.setProps({ slot: freeSlot() }); old({ data: [candidate('old')] }); await flushPromises()
  expect(w.find('[data-test="candidate-old"]').exists()).toBe(false); expect(w.get('[data-test="search"]').element).toHaveProperty('value', '')
})
it('requires removal confirmation, preserves roster on failure and emits refresh after DELETE', async () => {
  const w = await mountSuspended(SlotList, { props: { slots: [{ ...roleSlot(), assignments: [assignment], filled_count: 1 }] } })
  await w.get('[data-test="remove-assignment-a1"]').trigger('click'); expect(remove).not.toHaveBeenCalled()
  await w.get('[data-test="cancel-remove-assignment"]').trigger('click'); expect(remove).not.toHaveBeenCalled()
  await w.get('[data-test="remove-assignment-a1"]').trigger('click')
  remove.mockRejectedValueOnce({ statusCode: 422, data: { message: 'Назначения отменённого события изменить нельзя.' } })
  await w.get('[data-test="confirm-remove-assignment"]').trigger('click'); await flushPromises()
  expect(w.text()).toContain('отменённого события'); expect(w.text()).toContain('Анна'); expect(w.emitted('changed')).toBeUndefined()
  await w.get('[data-test="confirm-remove-assignment"]').trigger('click'); await flushPromises()
  expect(remove).toHaveBeenLastCalledWith('/assignments/a1'); expect(w.emitted('changed')).toHaveLength(1)
})
it('uses can_fill for assignment and removal regardless of management permissions', async () => {
  const w = await mountSuspended(SlotList, { props: { slots: [{ ...roleSlot(), can_fill: false, assignments: [assignment] }] } })
  expect(w.find('button').exists()).toBe(false)
  await w.setProps({ slots: [{ ...roleSlot(), assignments: [assignment] }] })
  expect(w.find('[data-test="remove-assignment-a1"]').exists()).toBe(true)
})
it('refreshes event counts and roster after assignment without losing dialog warnings, then refreshes after removal', async () => {
  const filled = { ...roleSlot(), filled_count: 1, assignments: [assignment] }
  get.mockImplementation(async (path: string) => ({ data: path.includes('candidates') ? [candidate()] : event(roleSlot()) }))
  const w = await mountSuspended(EventPage)
  await w.get('[data-test="assign-s1"]').trigger('click'); await flushPromises()
  get.mockImplementation(async (path: string) => ({ data: path.includes('candidates') ? [candidate()] : event(filled) }))
  post.mockResolvedValue({ data: assignment, warnings: [{ code: 'over_capacity', message: 'Слот заполнен сверх нормы.' }] })
  await w.get('[data-test="candidate-p1"]').trigger('click'); await flushPromises()
  expect(w.get('[data-test="slot-s1-count"]').text()).toBe('1 из 2'); expect(w.get('[data-test="warnings"]').text()).toContain('сверх нормы')
  expect(w.get('[data-test="candidate-p1"]').attributes('disabled')).toBeDefined()
  await w.get('[data-test="close-assign"]').trigger('click')
  await w.get('[data-test="remove-assignment-a1"]').trigger('click')
  get.mockResolvedValue({ data: event(roleSlot()) })
  await w.get('[data-test="confirm-remove-assignment"]').trigger('click'); await flushPromises()
  expect(w.get('[data-test="slot-s1-count"]').text()).toBe('0 из 2'); expect(w.find('[data-test="remove-assignment-a1"]').exists()).toBe(false)
})

it('keeps saved warnings and blocks repeat submission when roster refresh fails, and can retry refresh', async () => {
  get.mockImplementation(async (path: string) => ({ data: path.includes('candidates') ? [candidate()] : event(roleSlot()) }))
  const w = await mountSuspended(EventPage)
  await w.get('[data-test="assign-s1"]').trigger('click'); await flushPromises()
  get.mockRejectedValueOnce(new Error('offline'))
  post.mockResolvedValue({ data: assignment, warnings: [{ code: 'time_conflict', message: 'Есть пересечение.', event_ids: [] }] })
  await w.get('[data-test="candidate-p1"]').trigger('click'); await flushPromises()
  expect(w.text()).toContain('Изменение сохранено'); expect(w.get('[data-test="warnings"]').text()).toContain('пересечение')
  expect(w.get('[data-test="candidate-p1"]').attributes('disabled')).toBeDefined()
  get.mockResolvedValueOnce({ data: event({ ...roleSlot(), filled_count: 1, assignments: [assignment] }) })
  await w.get('[data-test="retry-assignments"]').trigger('click'); await flushPromises()
  expect(w.get('[data-test="slot-s1-count"]').text()).toBe('1 из 2'); expect(post).toHaveBeenCalledTimes(1)
  expect(w.get('[data-test="warnings"]').text()).toContain('пересечение')
})
it('ignores a pending free-search response after input becomes too short', async () => {
  let finish!: (value: unknown) => void
  get.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const w = await mountSuspended(AssignDialog, { props: { slot: freeSlot() } }); vi.useFakeTimers()
  await w.get('[data-test="search"]').setValue('ан'); await vi.advanceTimersByTimeAsync(300)
  await w.get('[data-test="search"]').setValue('а'); finish({ data: [candidate()] }); await vi.advanceTimersByTimeAsync(0)
  expect(w.find('[data-test="candidate-p1"]').exists()).toBe(false); expect(w.text()).not.toContain('Загружаем')
})
it('retries candidate loading and does not request or assign without can_fill', async () => {
  get.mockRejectedValueOnce({ statusCode: 403 })
  const w = await mountSuspended(AssignDialog, { props: { slot: roleSlot() } }); await flushPromises()
  expect(w.text()).toContain('Нет права на это действие')
  await w.get('[role="alert"] button').trigger('click'); await flushPromises()
  expect(w.find('[data-test="candidate-p1"]').exists()).toBe(true)
  await w.setProps({ slot: { ...roleSlot(), can_fill: false } })
  expect(w.find('[data-test="candidate-p1"]').exists()).toBe(false); expect(get).toHaveBeenCalledTimes(2); expect(post).not.toHaveBeenCalled()
})
it('discards late assignment success after changing slots', async () => {
  let finish!: (value: unknown) => void
  post.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const w = await mountSuspended(AssignDialog, { props: { slot: roleSlot() } }); await flushPromises()
  await w.get('[data-test="candidate-p1"]').trigger('click')
  await w.setProps({ slot: freeSlot() }); finish({ data: assignment, warnings: [{ code: 'over_capacity', message: 'Сверх нормы' }] }); await flushPromises()
  expect(w.emitted('assigned')).toBeUndefined(); expect(w.find('[data-test="warnings"]').exists()).toBe(false)
})

it.each([403, 404])('clears an unavailable event after successful removal followed by HTTP %s', async (statusCode) => {
  get.mockResolvedValueOnce({ data: event({ ...roleSlot(), filled_count: 1, assignments: [assignment] }) })
  const w = await mountSuspended(EventPage)
  await w.get('[data-test="remove-assignment-a1"]').trigger('click')
  get.mockRejectedValueOnce({ statusCode })
  await w.get('[data-test="confirm-remove-assignment"]').trigger('click'); await flushPromises()
  expect(remove).toHaveBeenCalledWith('/assignments/a1')
  expect(w.find('article').exists()).toBe(false); expect(w.find('[data-test="assign-s1"]').exists()).toBe(false)
  expect(w.text()).toContain('Изменение сохранено'); expect(w.text()).toContain('Событие больше недоступно')
  expect(w.find('[data-test="retry-assignments"]').exists()).toBe(false)
})
