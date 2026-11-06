// @vitest-environment nuxt
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { useRouter } from '#app'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ChatsIndex from '~/pages/chats/index.vue'
import MemberDetailsDialog from '~/components/ministries/MemberDetailsDialog.vue'
import { useAuthStore } from '~/stores/auth'
import { useChatsStore } from '~/stores/chats'
import type { Person } from '~/utils/people'
import { grantPermissions } from '../support/permissions'

const m = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
mockNuxtImport('useApi', () => () => m)
const person = (id = 'p1', over = {}): Person => ({ id, first_name: 'Анна', last_name: 'Петрова', patronymic: null, full_name: 'Петрова Анна', photo_url: null, status: 'member', archived: false, has_account: true, user_id: 'account-' + id, account_disabled: false, has_global_roles: true, ...over })
const member = { id: 'membership-1', ministry_id: 'm1', person_id: 'p1', joined_at: '', full_name: 'Петрова Анна', photo_url: null, roles: [{ id: 'r1', name: 'Участник' }] }
let people: Person[], push: ReturnType<typeof vi.spyOn>
const rights = (...global: string[]) => grantPermissions({ global })
async function choose() {
  const page = await mountSuspended(ChatsIndex)
  await page.get('[data-test="new-message"]').trigger('click'); await flushPromises()
  return page
}
enableAutoUnmount(afterEach)
beforeEach(() => {
  vi.resetAllMocks(); rights('people.view', 'chats.dm')
  useChatsStore().unsubscribeUser()
  people = [person()]
  m.get.mockImplementation((path: string) => Promise.resolve(path === '/chats' ? { data: [], meta: { unread_total: 0 } } : path === '/people' ? { data: people, meta: { last_page: 1 } } : { data: people[0] }))
  m.post.mockResolvedValue({ data: { id: 'direct-chat' } })
  push = vi.spyOn(useRouter(), 'push').mockResolvedValue(undefined)
})
afterEach(() => vi.restoreAllMocks())

it.each([{ keys: [] }, { keys: ['people.view'] }, { keys: ['chats.dm'] }])('does not offer or query a new message without both rights: %j', async ({ keys }) => {
  rights(...keys)
  const page = await mountSuspended(ChatsIndex)
  expect(page.find('[data-test="new-message"]').exists()).toBe(false)
  expect(m.get.mock.calls.some(([path]) => path === '/people')).toBe(false)
  expect(m.post).not.toHaveBeenCalled()
})
it('opens the permitted directory immediately and uses the account ID without inserting an empty chat', async () => {
  const page = await choose()
  expect(m.get).toHaveBeenCalledWith('/people', { has_account: 1, per_page: 20, page: 1 })
  await page.get('[data-test="option-p1"]').trigger('click'); await flushPromises()
  expect(m.post).toHaveBeenCalledWith('/chats', { type: 'direct', user_id: 'account-p1' })
  expect(push).toHaveBeenCalledWith('/chats/direct-chat')
  expect(useChatsStore().chats).toEqual([])
})
it('excludes self, archived, disabled and accountless people', async () => {
  useAuthStore().user = { id: 'self', phone: null, email: null, ical_url: '' }
  people.push(person('self', { user_id: 'self' }), person('archived', { archived: true }), person('disabled', { account_disabled: true }), person('none', { has_account: false, user_id: null }))
  const page = await choose()
  expect(page.findAll('[data-test^="option-"]')).toHaveLength(1)
})
it('deduplicates pending selection and preserves it across unrelated rights refresh', async () => {
  let finish!: (value: unknown) => void
  m.post.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const page = await choose()
  await page.get('[data-test="option-p1"]').trigger('click')
  rights('people.view', 'chats.dm', 'people.view_contacts'); await flushPromises()
  await page.get('[data-test="option-p1"]').trigger('click')
  expect(m.post).toHaveBeenCalledTimes(1)
  finish({ data: { id: 'confirmed' } }); await flushPromises()
  expect(push).toHaveBeenCalledWith('/chats/confirmed')
})
it.each(['session', 'right', 'unmount'])('ignores late success and failure after %s invalidation', async (change) => {
  let reject!: (value: unknown) => void
  m.post.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail }))
  const page = await choose()
  await page.get('[data-test="option-p1"]').trigger('click')
  if (change === 'session') useAuthStore().sessionVersion++
  else if (change === 'right') rights('people.view')
  else page.unmount()
  reject(new Error('late failure')); await flushPromises()
  expect(push).not.toHaveBeenCalled()
  if (change !== 'unmount') expect(page.text()).not.toContain('late failure')
})
it('keeps confirmed chat after navigation failure and retries navigation without another POST', async () => {
  push.mockRejectedValueOnce(new Error('navigation unavailable'))
  const page = await choose()
  await page.get('[data-test="option-p1"]').trigger('click'); await flushPromises()
  expect(page.text()).toContain('Личный чат открыт')
  expect(page.text()).toContain('Не удалось перейти')
  rights('people.view', 'chats.dm', 'people.view_contacts'); await flushPromises()
  await page.get('[data-test="open-direct-chat"]').trigger('click'); await flushPromises()
  expect(m.post).toHaveBeenCalledTimes(1)
  expect(push).toHaveBeenCalledTimes(2)
})
it('permits retry of a failed POST without losing available choices', async () => {
  m.post.mockRejectedValueOnce(new Error('offline'))
  const page = await choose()
  await page.get('[data-test="option-p1"]').trigger('click'); await flushPromises()
  expect(page.text()).toContain('Не удалось открыть личный чат')
  await page.get('[data-test="option-p1"]').trigger('click'); await flushPromises()
  expect(m.post).toHaveBeenCalledTimes(2)
  expect(push).toHaveBeenCalledWith('/chats/direct-chat')
})
it('resolves a ministry member through the person card and posts its different account ID', async () => {
  const dialog = await mountSuspended(MemberDetailsDialog, { props: { member, ministryId: 'm1', rolesCatalogue: [] } })
  expect(m.get).not.toHaveBeenCalled()
  await dialog.get('[data-test="write-member"]').trigger('click'); await flushPromises()
  expect(m.get).toHaveBeenCalledWith('/people/p1')
  expect(m.post).toHaveBeenCalledWith('/chats', { type: 'direct', user_id: 'account-p1' })
})
it.each([{ keys: [] }, { keys: ['chats.dm'] }, { keys: ['people.view'] }])('does not resolve a member card without both rights: %j', async ({ keys }) => {
  rights(...keys)
  const dialog = await mountSuspended(MemberDetailsDialog, { props: { member, ministryId: 'm1', rolesCatalogue: [] } })
  expect(dialog.find('[data-test="write-member"]').exists()).toBe(false)
  expect(m.get).not.toHaveBeenCalled(); expect(m.post).not.toHaveBeenCalled()
})
it.each([{ archived: true }, { account_disabled: true }, { has_account: false, user_id: null }])('does not start a chat with an unavailable resolved member: %j', async (over) => {
  people = [person('p1', over)]
  const dialog = await mountSuspended(MemberDetailsDialog, { props: { member, ministryId: 'm1', rolesCatalogue: [] } })
  await dialog.get('[data-test="write-member"]').trigger('click'); await flushPromises()
  expect(m.post).not.toHaveBeenCalled()
  expect(dialog.text()).toContain('Нет доступного аккаунта')
})

it('invalidates a member account read permanently when its right is revoked and restored', async () => {
  let finish!: (value: unknown) => void
  m.get.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const dialog = await mountSuspended(MemberDetailsDialog, { props: { member, ministryId: 'm1', rolesCatalogue: [] } })
  await dialog.get('[data-test="write-member"]').trigger('click')
  rights('people.view'); await flushPromises()
  rights('people.view', 'chats.dm'); await flushPromises()
  finish({ data: person() }); await flushPromises()
  expect(m.post).not.toHaveBeenCalled()
  expect(push).not.toHaveBeenCalled()
})
it('blocks member role edits and exclusion while the direct chat write is pending', async () => {
  grantPermissions({ global: ['people.view', 'chats.dm'], ministries: { m1: ['members.manage'] } })
  let finish!: (value: unknown) => void
  m.post.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const dialog = await mountSuspended(MemberDetailsDialog, { props: { member, ministryId: 'm1', rolesCatalogue: member.roles } })
  await dialog.get('[data-test="remove-member"]').trigger('click')
  await dialog.get('[data-test="write-member"]').trigger('click'); await flushPromises()
  expect(dialog.get('fieldset').attributes('disabled')).toBeDefined()
  expect(dialog.get('[data-test="save-roles"]').attributes('disabled')).toBeDefined()
  expect(dialog.get('[data-test="confirm-remove-member"]').attributes('disabled')).toBeDefined()
  finish({ data: { id: 'direct-chat' } }); await flushPromises()
})
it('ignores late successful writes after a same-account new session', async () => {
  let finish!: (value: unknown) => void
  m.post.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const page = await choose()
  await page.get('[data-test="option-p1"]').trigger('click')
  useAuthStore().sessionVersion++; await flushPromises()
  finish({ data: { id: 'previous-session-chat' } }); await flushPromises()
  expect(push).not.toHaveBeenCalled()
})
it('treats a resolved router navigation failure as a transition failure, preserving the confirmed chat', async () => {
  push.mockResolvedValueOnce(new Error('aborted transition') as never)
  const page = await choose()
  await page.get('[data-test="option-p1"]').trigger('click'); await flushPromises()
  expect(page.text()).toContain('Не удалось перейти')
  await page.get('[data-test="open-direct-chat"]').trigger('click'); await flushPromises()
  expect(m.post).toHaveBeenCalledTimes(1)
  expect(push).toHaveBeenCalledTimes(2)
})

it('does not navigate after member details close because their context changed during a POST', async () => {
  let finish!: (value: unknown) => void
  m.post.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const dialog = await mountSuspended(MemberDetailsDialog, { props: { member, ministryId: 'm1', rolesCatalogue: [] } })
  await dialog.get('[data-test="write-member"]').trigger('click'); await flushPromises()
  await dialog.setProps({ member: { ...member, id: 'membership-2', person_id: 'p2' } })
  expect(dialog.emitted('close')).toHaveLength(1)
  finish({ data: { id: 'old-member-chat' } }); await flushPromises()
  expect(push).not.toHaveBeenCalled()
})
