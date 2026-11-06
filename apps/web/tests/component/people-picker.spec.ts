// @vitest-environment nuxt
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import PeoplePicker from '~/components/people/PeoplePicker.vue'
import AccountPicker from '~/components/chat/AccountPicker.vue'
import AddMemberDialog from '~/components/ministries/AddMemberDialog.vue'
import { useAuthStore } from '~/stores/auth'
import type { Person } from '~/utils/people'
import { grantPermissions } from '../support/permissions'

const m = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
mockNuxtImport('useApi', () => () => m)
const person = (id = 'p1', over = {}): Person => ({ id, first_name: 'Анна', last_name: 'Петрова', patronymic: null, full_name: 'Петрова Анна', photo_url: null, status: 'member', archived: false, has_account: true, user_id: 'u-' + id, account_disabled: false, has_global_roles: true, ...over })
const response = (data: Person[], last = 1) => ({ data, meta: { current_page: 1, last_page: last, total: data.length } })
enableAutoUnmount(afterEach)
beforeEach(() => { vi.resetAllMocks(); grantPermissions({ global: ['people.view'], ministries: { m1: ['members.manage'], m2: ['members.manage'] } }); m.get.mockResolvedValue(response([person()])) })
afterEach(() => vi.useRealTimers())

it('previews the first twenty active accounts immediately without a search parameter', async () => {
  const picker = await mountSuspended(AccountPicker)
  await flushPromises()
  expect(m.get).toHaveBeenCalledWith('/people', { has_account: 1, per_page: 20, page: 1 })
  expect(picker.find('[data-test="option-p1"]').exists()).toBe(true)
})

it('previews people without filtering out those without accounts', async () => {
  m.get.mockResolvedValue(response([person('p1', { user_id: null, has_account: false })]))
  const dialog = await mountSuspended(AddMemberDialog, { props: { ministryId: 'm1' } })
  await flushPromises()
  expect(m.get).toHaveBeenCalledWith('/people', { per_page: 20, page: 1 })
  expect(dialog.find('[data-test="option-p1"]').exists()).toBe(true)
})

it('debounces member search by 300ms and restores the preview on clearing it', async () => {
  const dialog = await mountSuspended(AddMemberDialog, { props: { ministryId: 'm1' } })
  vi.useFakeTimers(); m.get.mockClear()
  await dialog.get('input[type="search"]').setValue('Петр')
  await vi.advanceTimersByTimeAsync(299)
  expect(m.get).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1); await flushPromises()
  expect(m.get).toHaveBeenLastCalledWith('/people', { search: 'Петр', per_page: 20, page: 1 })
  await dialog.get('input[type="search"]').setValue('')
  await flushPromises()
  expect(m.get).toHaveBeenLastCalledWith('/people', { per_page: 20, page: 1 })
})

it('keeps pagination reachable when every person on the first page is excluded', async () => {
  m.get.mockResolvedValueOnce(response([person()], 2)).mockResolvedValueOnce(response([person(), person('p2')], 2))
  const picker = await mountSuspended(AccountPicker, { props: { excluded: ['u-p1'] } })
  await flushPromises()
  expect(picker.find('[data-test="option-p1"]').exists()).toBe(false)
  expect(picker.find('[data-test="more-people"]').exists()).toBe(true)
  await picker.get('[data-test="more-people"]').trigger('click'); await flushPromises()
  expect(m.get).toHaveBeenLastCalledWith('/people', { has_account: 1, per_page: 20, page: 2 })
  expect(picker.findAll('[data-test="option-p2"]')).toHaveLength(1)
})

it('does not query or retain candidates without people.view', async () => {
  grantPermissions({ ministries: { m1: ['members.manage'] } })
  const dialog = await mountSuspended(AddMemberDialog, { props: { ministryId: 'm1' } })
  if (dialog.find('input').exists()) await dialog.get('input').setValue('Петр')
  await new Promise(r => setTimeout(r, 310)); await flushPromises()
  expect(m.get).not.toHaveBeenCalled()
  expect(dialog.find('[data-test="option-p1"]').exists()).toBe(false)
})

it.each(['session', 'ministry'] as const)('rejects a late preview and member write after changing %s', async (change) => {
  let finish!: (value: unknown) => void
  m.get.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const dialog = await mountSuspended(AddMemberDialog, { props: { ministryId: 'm1' } })
  expect(m.get).toHaveBeenCalledTimes(1)
  if (change === 'session') useAuthStore().sessionVersion++
  else await dialog.setProps({ ministryId: 'm2' })
  await flushPromises()
  finish(response([person()])); await flushPromises()
  expect(dialog.find('[data-test="option-p1"]').exists()).toBe(false)
  expect(dialog.emitted('close')).toHaveLength(1)
  expect(m.post).not.toHaveBeenCalled()
})


it('maps excluded account IDs on every page without treating them as person IDs', async () => {
  m.get.mockResolvedValueOnce(response([
    person('p-allowed', { user_id: 'p-excluded' }),
    person('p-excluded', { user_id: 'u-excluded' }),
  ], 2)).mockResolvedValueOnce(response([
    person('p-later-excluded', { user_id: 'u-excluded' }),
    person('p-later', { user_id: 'u-later' }),
  ], 2))
  const picker = await mountSuspended(AccountPicker, { props: { excluded: ['u-excluded'] } })
  await flushPromises()
  expect(picker.find('[data-test="option-p-allowed"]').exists()).toBe(true)
  expect(picker.find('[data-test="option-p-excluded"]').exists()).toBe(false)
  await picker.get('[data-test="more-people"]').trigger('click'); await flushPromises()
  expect(picker.find('[data-test="option-p-later-excluded"]').exists()).toBe(false)
  await picker.get('[data-test="option-p-later"]').trigger('click')
  expect(picker.emitted('selected')?.at(-1)).toEqual([['u-later']])
  expect(m.get).toHaveBeenCalledTimes(2)
})

it('rejects a late member mutation after the ministry changes', async () => {
  let finish!: (value: unknown) => void
  m.post.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const dialog = await mountSuspended(AddMemberDialog, { props: { ministryId: 'm1' } })
  await flushPromises()
  await dialog.get('[data-test="option-p1"]').trigger('click')
  expect(m.post).toHaveBeenCalledWith('/ministries/m1/members', { person_id: 'p1' })
  await dialog.setProps({ ministryId: 'm2' })
  finish({ data: { id: 'member-old' } }); await flushPromises()
  expect(dialog.emitted('added')).toBeUndefined()
  expect(dialog.emitted('close')).toHaveLength(1)
})


it('deduplicates pages, renders photos and initials, and emits one Person at a time', async () => {
  m.get.mockResolvedValueOnce(response([person('p1', { photo_url: '/photo.webp' }), person('p2')], 2))
    .mockResolvedValueOnce(response([person('p1'), person('p3')], 2))
  const picker = await mountSuspended(PeoplePicker, { props: { mode: 'people' } })
  await flushPromises()
  expect(picker.get('[data-test="option-p1"] img').attributes('src')).toBe('/photo.webp')
  expect(picker.get('[data-test="option-p2"] .people-picker__avatar').text()).toBe('ПА')
  await picker.get('[data-test="more-people"]').trigger('click'); await flushPromises()
  expect(picker.findAll('[data-test="option-p1"]')).toHaveLength(1)
  await picker.get('[data-test="option-p3"]').trigger('click')
  expect(picker.emitted('select')).toEqual([[person('p3')]])
  expect(picker.find('[data-test="option-p3"]').exists()).toBe(true)
  await picker.setProps({ excludedIds: ['p3'] })
  expect(picker.find('[data-test="option-p3"]').exists()).toBe(false)
})

it('filters archived people, disabled/missing/self accounts and blocks disabled selection', async () => {
  const auth = useAuthStore()
  m.get.mockResolvedValue(response([
    person('archived', { archived: true }), person('disabled', { account_disabled: true }),
    person('no-account', { has_account: false, user_id: null }), person('self', { user_id: auth.user!.id }), person(),
  ]))
  const picker = await mountSuspended(PeoplePicker, { props: { mode: 'accounts' } })
  await flushPromises()
  expect(picker.findAll('.people-picker__option')).toHaveLength(1)
  await picker.setProps({ disabled: true })
  expect(picker.get('[data-test="option-p1"]').attributes('disabled')).toBeDefined()
  await picker.get('[data-test="option-p1"]').trigger('click')
  expect(picker.emitted('select')).toBeUndefined()
})

it('invalidates in-flight previews and searches immediately when query changes', async () => {
  const finishes: ((value: unknown) => void)[] = []
  m.get.mockImplementation(() => new Promise(resolve => { finishes.push(resolve) }))
  const picker = await mountSuspended(PeoplePicker, { props: { mode: 'people' } })
  vi.useFakeTimers()
  await picker.get('input').setValue('Первая')
  finishes[0]!(response([person('old-preview')])); await flushPromises()
  expect(picker.find('.people-picker__option').exists()).toBe(false)
  await vi.advanceTimersByTimeAsync(300)
  await picker.get('input').setValue('Вторая')
  finishes[1]!(response([person('old-search')])); await flushPromises()
  expect(picker.find('.people-picker__option').exists()).toBe(false)
  await vi.advanceTimersByTimeAsync(300)
  finishes[2]!(response([person('current')])); await flushPromises()
  expect(picker.get('[data-test="option-current"]').text()).toContain('Петрова Анна')
})

it('clears data on permission withdrawal and rejects the pending response', async () => {
  let finish!: (value: unknown) => void
  m.get.mockResolvedValueOnce(response([person()], 2)).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const picker = await mountSuspended(PeoplePicker, { props: { mode: 'people' } })
  await flushPromises()
  await picker.get('[data-test="more-people"]').trigger('click')
  grantPermissions(); await flushPromises()
  finish(response([person('late')])); await flushPromises()
  expect(picker.find('.people-picker__option').exists()).toBe(false)
  expect(picker.find('input').exists()).toBe(false)
  expect(picker.text()).toContain('Нет права')
})

it('retains loaded data on a page error and retries the same page rather than skipping it', async () => {
  m.get.mockResolvedValueOnce(response([person()], 3)).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(response([person('p2')], 3))
  const picker = await mountSuspended(PeoplePicker, { props: { mode: 'people' } })
  await flushPromises()
  await picker.get('[data-test="more-people"]').trigger('click'); await flushPromises()
  expect(picker.find('[data-test="option-p1"]').exists()).toBe(true)
  expect(picker.get('[role="alert"]').text()).toContain('Не удалось')
  await picker.get('[role="alert"] button').trigger('click'); await flushPromises()
  expect(m.get).toHaveBeenLastCalledWith('/people', { per_page: 20, page: 2 })
  expect(picker.find('[data-test="option-p2"]').exists()).toBe(true)
})
