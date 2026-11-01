// @vitest-environment nuxt
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { useRouter } from '#app'
import { useSettingsStore } from '~/stores/settings'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ChatHeader from '~/components/chat/ChatHeader.vue'
import NewGroupDialog from '~/components/chat/NewGroupDialog.vue'
import ChatMembersDialog from '~/components/chat/ChatMembersDialog.vue'
import ChatsIndex from '~/pages/chats/index.vue'
import PersonCard from '~/pages/people/[id].vue'
import EventPage from '~/pages/events/[id].vue'
import MinistryChat from '~/pages/ministries/[id]/chat.vue'
import ChatScreen from '~/components/chat/ChatScreen.vue'
import ChatListItem from '~/components/chat/ChatListItem.vue'
import AccountPicker from '~/components/chat/AccountPicker.vue'
import MediaUploader from '~/components/MediaUploader.vue'
import MinistryTabs from '~/components/ministries/MinistryTabs.vue'
import { useAuthStore } from '~/stores/auth'
import { grantPermissions } from '../support/permissions'
import type { components } from '~~/types/api'

const m = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn(), put: vi.fn(), push: vi.fn() }))
mockNuxtImport('useApi', () => () => ({ get: m.get, post: m.post, patch: m.patch, delete: m.del, put: m.put }))
mockNuxtImport('useRoute', () => () => ({ params: { id: 'x1' } }))
type Chat = components['schemas']['ChatResource']
const chat = (over = {}): Chat => ({ id: 'c1', type: 'group', title: 'Поездка', avatar_url: null, ministry_id: null, event_id: null, archived: false, last_message: null, last_message_at: null, unread_count: 0, muted_until: null, is_owner: false, can_write: true, can_moderate: false, can_manage_members: false, pinned_messages: [], members: [{ user_id: 'u2', person_id: 'p1', full_name: 'Анна', photo_url: null, is_owner: false, joined_at: '' }], ...over })
const person = (over = {}) => ({ id: 'p1', full_name: 'Анна', has_account: true, user_id: 'u2', account_disabled: false, archived: false, status: 'member', has_global_roles: false, ...over })
enableAutoUnmount(afterEach)
beforeEach(() => {
  vi.resetAllMocks(); grantPermissions({ global: ['people.view', 'chats.create_groups', 'chats.dm'] })
  vi.spyOn(useRouter(), 'push').mockImplementation(m.push)
  useSettingsStore().apply({ church_name: 'Церковь', timezone: 'UTC' } as never)
  m.get.mockResolvedValue({ data: [], meta: {} }); m.post.mockResolvedValue({ data: chat({ id: 'c9' }) }); m.patch.mockResolvedValue({ data: chat() }); m.del.mockResolvedValue({ data: chat() })
})
afterEach(() => vi.useRealTimers())

it('searches account-filtered pages, excludes disabled/self accounts, creates selected group', async () => {
  m.get.mockResolvedValue({ data: [person(), person({ id: 'p2', user_id: 'u3', account_disabled: true }), person({ id: 'p3', user_id: null, has_account: false })], meta: {} })
  const dialog = await mountSuspended(NewGroupDialog)
  await dialog.get('[data-test="title"]').setValue('Поездка')
  await dialog.get('[data-test="search"]').setValue('анн')
  await new Promise(r => setTimeout(r, 350)); await flushPromises()
  expect(m.get).toHaveBeenCalledWith('/people', expect.objectContaining({ search: 'анн', has_account: 1 }))
  expect(dialog.find('[data-test="option-p2"]').exists()).toBe(false)
  expect(dialog.find('[data-test="option-p3"]').exists()).toBe(false)
  await dialog.get('[data-test="option-p1"]').trigger('click')
  await dialog.get('form').trigger('submit'); await flushPromises()
  expect(m.post).toHaveBeenCalledWith('/chats', { type: 'group', title: 'Поездка', member_ids: ['u2'] })
  expect(m.push).toHaveBeenCalledWith('/chats/c9')
})
it('does not query Directory without people.view and explains unavailable selection', async () => {
  grantPermissions({ global: ['chats.create_groups'] })
  const dialog = await mountSuspended(NewGroupDialog)
  expect(dialog.text()).toContain('Нет права на просмотр справочника')
  expect(dialog.find('[data-test="search"]').exists()).toBe(false)
  expect(m.get).not.toHaveBeenCalled()
})
it('shows a working new group control only with create_groups', async () => {
  const page = await mountSuspended(ChatsIndex)
  await page.get('[data-test="new-group"]').trigger('click')
  expect(page.findComponent(NewGroupDialog).exists()).toBe(true)
  grantPermissions(); await flushPromises()
  expect(page.find('[data-test="new-group"]').exists()).toBe(false)
  expect(page.findComponent(NewGroupDialog).exists()).toBe(false)
})
it('exposes group-only management from server flags and confirms leave/archive', async () => {
  const member = await mountSuspended(ChatHeader, { props: { chat: chat(), member: true, busy: false } })
  await member.get('[data-test="menu"]').trigger('click')
  expect(member.find('[data-test="leave"]').exists()).toBe(true)
  expect(member.find('[data-test="archive"]').exists()).toBe(false)
  await member.get('[data-test="leave"]').trigger('click')
  expect(m.post).not.toHaveBeenCalled()
  await member.get('[data-test="confirm-action"]').trigger('click'); await flushPromises()
  expect(m.post).toHaveBeenCalledWith('/chats/c1/leave', {})
  expect(m.push).toHaveBeenCalledWith('/chats')
  const owner = await mountSuspended(ChatHeader, { props: { chat: chat({ is_owner: true, can_manage_members: true, can_moderate: true }), member: true, busy: false } })
  await owner.get('[data-test="menu"]').trigger('click')
  expect(owner.find('[data-test="leave"]').exists()).toBe(false)
  expect(owner.find('[data-test="archive"]').exists()).toBe(true)
  await owner.get('[data-test="rename"]').trigger('click')
  await owner.get('[data-test="group-title"]').setValue('Новое')
  await owner.get('form').trigger('submit'); await flushPromises()
  expect(m.patch).toHaveBeenCalledWith('/chats/c1', { title: 'Новое' })
  await owner.get('[data-test="menu"]').trigger('click')
  expect(owner.find('[data-test="avatar"]').exists()).toBe(true)
  const ministry = await mountSuspended(ChatHeader, { props: { chat: chat({ type: 'ministry', can_manage_members: true, can_moderate: true }), member: true, busy: false } })
  await ministry.get('[data-test="menu"]').trigger('click')
  for (const key of ['leave', 'members', 'archive', 'rename', 'avatar']) expect(ministry.find(`[data-test="${key}"]`).exists()).toBe(false)
})
it('adds/removes actual user ids, protects owner, and refreshes membership', async () => {
  m.get.mockResolvedValue({ data: [person({ id: 'p9', user_id: 'u9' })], meta: {} })
  const dialog = await mountSuspended(ChatMembersDialog, { props: { chat: chat({ can_manage_members: true, members: [...chat().members, { ...chat().members[0]!, user_id: 'owner', is_owner: true }] }) } })
  expect(dialog.find('[data-test="remove-owner"]').exists()).toBe(false)
  await dialog.get('[data-test="remove-u2"]').trigger('click')
  await dialog.get('[data-test="confirm-remove"]').trigger('click'); await flushPromises()
  expect(m.del).toHaveBeenCalledWith('/chats/c1/members/u2')
  await dialog.get('[data-test="search"]').setValue('анн'); await new Promise(r => setTimeout(r, 350)); await flushPromises()
  await dialog.get('[data-test="option-p9"]').trigger('click')
  await dialog.get('[data-test="add-members"]').trigger('click'); await flushPromises()
  expect(m.post).toHaveBeenCalledWith('/chats/c1/members', { user_ids: ['u9'] })
  expect(dialog.emitted('changed')).toHaveLength(2)
})
it('uses finite mute durations and forever body, and unmute endpoint', async () => {
  const header = await mountSuspended(ChatHeader, { props: { chat: chat(), member: true, busy: false } })
  await header.get('[data-test="menu"]').trigger('click')
  const before = Date.now()
  await header.get('[data-test="mute-8h"]').trigger('click'); await flushPromises()
  expect(m.post.mock.calls[0]![0]).toBe('/chats/c1/mute')
  expect(Math.abs(Date.parse(m.post.mock.calls[0]![1].until) - before - 8 * 3600000)).toBeLessThan(1500)
  await header.get('[data-test="mute-week"]').trigger('click'); await flushPromises()
  expect(Math.abs(Date.parse(m.post.mock.calls[1]![1].until) - Date.now() - 7 * 86400000)).toBeLessThan(1500)
  await header.get('[data-test="mute-forever"]').trigger('click'); await flushPromises()
  expect(m.post).toHaveBeenLastCalledWith('/chats/c1/mute', {})
  await header.setProps({ chat: chat({ muted_until: '9999-12-31T00:00:00Z' }) })
  await header.get('[data-test="unmute"]').trigger('click'); await flushPromises()
  expect(m.del).toHaveBeenCalledWith('/chats/c1/mute')
})
it('expires visible header/list mute while idle and cleans timers on unmount', async () => {
  const until = new Date(Date.now() + 1500).toISOString()
  const header = await mountSuspended(ChatHeader, { props: { chat: chat({ muted_until: until }), member: true, busy: false } })
  const list = await mountSuspended(ChatListItem, { props: { chat: chat({ muted_until: until }) } })
  await header.get('[data-test="menu"]').trigger('click')
  vi.useFakeTimers(); vi.setSystemTime(Date.now() + 2000)
  // Visibility also resumes clocks when a browser suspended its timers.
  document.dispatchEvent(new Event('visibilitychange')); await flushPromises()
  expect(header.find('[data-test="unmute"]').exists()).toBe(false)
  expect(list.find('[data-test="muted-c1"]').exists()).toBe(false)
  header.unmount(); list.unmount()
})
it('opens a direct chat only for eligible accounts and chats.dm', async () => {
  m.get.mockResolvedValue({ data: person({ id: 'x1' }) })
  const card = await mountSuspended(PersonCard)
  await card.get('[data-test="write"]').trigger('click'); await flushPromises()
  expect(m.post).toHaveBeenCalledWith('/chats', { type: 'direct', user_id: 'u2' })
  expect(m.push).toHaveBeenCalledWith('/chats/c9')
  grantPermissions({ global: ['people.view'] }); await flushPromises()
  expect(card.find('[data-test="write"]').exists()).toBe(false)
  grantPermissions({ global: ['people.view', 'chats.dm'] }); m.get.mockResolvedValue({ data: person({ account_disabled: true }) }); await flushPromises()
  const disabled = await mountSuspended(PersonCard)
  expect(disabled.find('[data-test="write"]').exists()).toBe(false)
})
it('creates event chat for managers and exposes existing chat link', async () => {
  const event = { id: 'x1', title: 'Т', status: 'scheduled', can_manage: true, chat_id: null, slots: [], attachments: [], starts_at: '2026-12-01T10:00:00Z', ends_at: '2026-12-01T11:00:00Z' }
  m.get.mockResolvedValue({ data: event })
  const page = await mountSuspended(EventPage)
  await page.get('[data-test="create-chat"]').trigger('click'); await flushPromises()
  expect(m.post).toHaveBeenCalledWith('/events/x1/chat', {})
  expect(m.push).toHaveBeenCalledWith('/chats/c9')
  m.get.mockResolvedValue({ data: { ...event, can_manage: false, chat_id: 'c7' } })
  const existing = await mountSuspended(EventPage)
  expect(existing.get('[data-test="open-chat"]').attributes('href')).toBe('/chats/c7')
  expect(existing.find('[data-test="create-chat"]').exists()).toBe(false)
})
it('embeds shared ChatScreen using actual ministry chat identity', async () => {
  m.get.mockResolvedValue({ data: { id: 'x1', name: 'Хор', chat_id: 'ministry-chat' } })
  const page = await mountSuspended(MinistryChat, { global: { stubs: { ChatScreen: true } } })
  expect(page.getComponent(ChatScreen).props('chatId')).toBe('ministry-chat')
})
it('keeps the ministry chat tab on pages without a loaded ministry card', async () => {
  m.get.mockResolvedValue({ data: { id: 'x1', chat_id: 'c7' } })
  const tabs = await mountSuspended(MinistryTabs, { props: { ministryId: 'x1' } })
  await flushPromises()
  expect(tabs.get('[data-test="ministry-chat-tab"]').attributes('href')).toBe('/ministries/x1/chat')
})
it('clears selected identities when the account session changes', async () => {
  m.get.mockResolvedValue({ data: [person()], meta: {} })
  const picker = await mountSuspended(AccountPicker)
  await picker.get('[data-test="search"]').setValue('анн'); await new Promise(r => setTimeout(r, 350)); await flushPromises()
  await picker.get('[data-test="option-p1"]').trigger('click')
  expect(picker.emitted('selected')?.at(-1)).toEqual([['u2']])
  useAuthStore().sessionVersion++; await flushPromises()
  expect(picker.emitted('selected')?.at(-1)).toEqual([[]])
  expect(picker.text()).not.toContain('Анна')
})
it('archives after confirmation and uses actual media uploader for group avatar', async () => {
  const header = await mountSuspended(ChatHeader, { props: { chat: chat({ is_owner: true, can_manage_members: true }), member: true, busy: false } })
  await header.get('[data-test="menu"]').trigger('click')
  await header.get('[data-test="avatar"]').trigger('click')
  const uploader = header.getComponent(MediaUploader)
  expect(uploader.props()).toMatchObject({ purpose: 'chat_avatar', target: '/chats/c1/avatar' })
  m.post.mockResolvedValue({ data: { id: 'media1', status: 'ready' } }); m.put.mockResolvedValue({ data: chat() })
  const input = uploader.get('input')
  Object.defineProperty(input.element, 'files', { value: [new File(['avatar'], 'avatar.png', { type: 'image/png' })], configurable: true })
  await input.trigger('change'); await flushPromises()
  expect(m.put).toHaveBeenCalledWith('/chats/c1/avatar', { media_id: 'media1' })
  await header.get('dialog').trigger('cancel'); await flushPromises()
  await header.get('[data-test="menu"]').trigger('click')
  await header.get('[data-test="archive"]').trigger('click'); await flushPromises()
  expect(m.post).not.toHaveBeenCalledWith('/chats/c1/archive', {})
  await header.get('[data-test="confirm-action"]').trigger('click'); await flushPromises()
  expect(m.post).toHaveBeenCalledWith('/chats/c1/archive', {})
  expect(header.emitted('changed')).toHaveLength(2)
})
it('retains failed creation choices, reports Directory refusal and retries', async () => {
  m.get.mockRejectedValueOnce({ statusCode: 403 })
  const dialog = await mountSuspended(NewGroupDialog)
  await dialog.get('[data-test="title"]').setValue('Поездка')
  await dialog.get('[data-test="search"]').setValue('анн'); await new Promise(r => setTimeout(r, 350)); await flushPromises()
  expect(dialog.find('[role="alert"]').exists()).toBe(true)
  m.get.mockResolvedValue({ data: [person()], meta: {} })
  await dialog.get('[role="alert"] button').trigger('click'); await flushPromises()
  await dialog.get('[data-test="option-p1"]').trigger('click')
  m.post.mockRejectedValueOnce(new Error('offline'))
  await dialog.get('form').trigger('submit'); await flushPromises()
  expect(dialog.text()).toContain('Не удалось создать группу')
  expect(dialog.text()).toContain('Анна')
  expect((dialog.get('[data-test="title"]').element as HTMLInputElement).value).toBe('Поездка')
  expect(m.push).not.toHaveBeenCalled()
})
it('offers no group mutations in direct/archived chats or mute for nonmembers', async () => {
  for (const over of [{ type: 'direct' }, { archived: true }]) {
    const header = await mountSuspended(ChatHeader, { props: { chat: chat({ ...over, can_manage_members: true, can_moderate: true }), member: false, busy: false } })
    await header.get('[data-test="menu"]').trigger('click')
    for (const key of ['leave', 'archive', 'rename', 'avatar', 'mute-forever']) expect(header.find(`[data-test="${key}"]`).exists()).toBe(false)
  }
})

it('uses native dialogs, closes on Escape and invalidates old session actions', async () => {
  const w = await mountSuspended(NewGroupDialog)
  expect(w.find('dialog').exists()).toBe(true)
  await w.get('dialog').trigger('cancel')
  expect(w.emitted('close')).toHaveLength(1)
  const members = await mountSuspended(ChatMembersDialog, { props: { chat: chat({ can_manage_members: true }) } })
  await members.get('[data-test="remove-u2"]').trigger('click')
  useAuthStore().sessionVersion++; await flushPromises()
  expect(members.emitted('close')).toHaveLength(1)
  expect(members.find('[data-test="confirm-remove"]').exists()).toBe(false)
})

it('closing the header menu before a group editor leaves one active dialog and restores the menu trigger', async () => {
  const header = await mountSuspended(ChatHeader, { props: { chat: chat({ is_owner: true, can_manage_members: true }), member: true, busy: false } })
  await header.get('[data-test="menu"]').trigger('click')
  await header.get('[data-test="rename"]').trigger('click'); await flushPromises()
  expect(header.findAll('dialog')).toHaveLength(1)
  expect(header.get('dialog').attributes('aria-label')).toBe('Переименовать группу')
  await header.get('dialog').trigger('cancel'); await flushPromises()
  expect(header.find('dialog').exists()).toBe(false)
  await header.get('[data-test="menu"]').trigger('click')
  await header.get('[data-test="members"]').trigger('click'); await flushPromises()
  expect(header.findAll('dialog')).toHaveLength(1)
  expect(header.get('dialog').attributes('aria-label')).toBe('Участники группы')
})
