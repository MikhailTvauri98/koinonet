// @vitest-environment nuxt
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, expect, it, vi } from 'vitest'
import { useChatMessages, type ChatMessage } from '~/composables/useChatMessages'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
mockNuxtImport('useApi', () => () => ({ get }))
export const message = (id: string, fraction = '000001') => ({ id, chat_id: 'c1', cursor: btoa(`2026-12-01T10:00:00.${fraction}Z|${id}`), created_at: `2026-12-01T10:00:00.${fraction}Z`, body: id, sender: null, attachments: [], reply_to: null, deleted: false, edited_at: null })
const page = (data: ChatMessage[] = [message('a')], next_after: string | null = null, next_before: string | null = null) => ({ data, next_after, next_before })
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r }); return { promise, resolve } }
beforeEach(() => { get.mockReset() })

it('orders full microseconds plus id, treating the cursor as opaque', async () => {
  get.mockResolvedValue(page([message('z', '000001'), message('a', '000002')], null, 'opaque-before'))
  const history = useChatMessages('c1')
  await history.loadInitial()
  get.mockResolvedValue(page([message('old', '000000')]))
  await history.loadOlder()
  expect(history.messages.value.map(m => m.id)).toEqual(['old', 'z', 'a'])
  expect(get).toHaveBeenLastCalledWith('/chats/c1/messages', { before: 'opaque-before' })
  expect(history.hasOlder.value).toBe(false)
})
it('exhausts reconnect pages from a frozen anchor despite live arrivals and reconciles old messages', async () => {
  get.mockResolvedValueOnce(page())
  const history = useChatMessages('c1'); await history.loadInitial()
  const pending = deferred<ReturnType<typeof page>>()
  get.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(page([message('c', '000003')])).mockResolvedValue({ data: { ...message('a'), body: 'corrected' } })
  const catching = history.catchUp()
  history.applySent(message('z', '000009'))
  pending.resolve(page([message('b', '000002')], 'opaque-next'))
  await catching
  expect(get.mock.calls[1]).toEqual(['/chats/c1/messages', { after: message('a').cursor }])
  expect(get.mock.calls[2]).toEqual(['/chats/c1/messages', { after: 'opaque-next' }])
  expect(history.messages.value.map(m => m.id)).toEqual(['a', 'b', 'c', 'z'])
  expect(history.messages.value[0]?.body).toBe('corrected')
})
it('does not resurrect tombstones or overwrite a live edit with an older snapshot', async () => {
  const pending = deferred<ReturnType<typeof page>>()
  get.mockReturnValue(pending.promise)
  const history = useChatMessages('c1'); const loading = history.loadInitial()
  history.applyEdited({ ...message('a'), body: 'new' }); history.applyDeleted('b')
  pending.resolve(page([message('a'), message('b', '000002')]))
  await loading
  expect(history.messages.value[0]?.body).toBe('new')
  expect(history.messages.value[1]).toMatchObject({ id: 'b', deleted: true, body: null, attachments: [] })
})
it('invalidates pending personalized hydration on deletion and disposal', async () => {
  const pending = deferred<{ data: ReturnType<typeof message> }>()
  get.mockResolvedValueOnce(page()).mockReturnValueOnce(pending.promise)
  const history = useChatMessages('c1'); await history.loadInitial()
  const loading = history.hydrate('a'); history.applyDeleted('a')
  pending.resolve({ data: message('a') }); await loading
  expect(history.messages.value[0]?.deleted).toBe(true)
  history.dispose()
  history.applySent(message('other'))
  expect(history.messages.value).toEqual([])
})
it('redacts replies when deletion arrives before the original or an old history snapshot', async () => {
  const reply = { ...message('b', '000002'), reply_to: { id: 'a', sender_name: 'Сергей', body_preview: 'secret', deleted: false } }
  get.mockResolvedValue(page([reply]))
  const history = useChatMessages('c1'); history.applyDeleted('a'); await history.loadInitial()
  expect(history.messages.value[0]?.reply_to).toEqual({ id: 'a', sender_name: null, body_preview: null, deleted: true })
  history.applySent(reply)
  expect(history.messages.value[0]?.reply_to?.body_preview).toBeNull()
})
it('keeps the contiguous HTTP anchor when live messages overtake initial hydration or reconnect', async () => {
  const pending = deferred<ReturnType<typeof page>>()
  get.mockReturnValueOnce(pending.promise)
  const history = useChatMessages('c1'); const loading = history.loadInitial()
  history.applySent(message('z', '000009')); pending.resolve(page()); await loading
  get.mockResolvedValueOnce(page([message('b', '000002')])).mockResolvedValue({ data: message('a') })
  await history.catchUp()
  expect(get.mock.calls[1]).toEqual(['/chats/c1/messages', { after: message('a').cursor }])
  expect(history.messages.value.map(m => m.id)).toEqual(['a', 'b', 'z'])
})
it('treats superseded deletion evidence as irreversible and redacts replies', async () => {
  const reply = { ...message('b', '000002'), reply_to: { id: 'a', sender_name: 'Сергей', body_preview: 'secret', deleted: false } }
  const old = deferred<{ data: ChatMessage }>()
  get.mockResolvedValueOnce(page([message('a'), reply])).mockReturnValueOnce(old.promise)
  const history = useChatMessages('c1'); await history.loadInitial()
  const pending = history.hydrate('a')
  history.applyEdited({ ...message('a'), body: 'live edit' })
  old.resolve({ data: { ...message('a'), deleted: true, body: null } }); await pending
  expect(history.messages.value[0]).toMatchObject({ deleted: true, body: null })
  expect(history.messages.value[1]?.reply_to).toMatchObject({ deleted: true, body_preview: null })
})
it('exhausts older pages when a confirmed empty baseline has no after cursor', async () => {
  get.mockResolvedValueOnce(page([]))
  const history = useChatMessages('c1'); await history.loadInitial()
  history.applySent(message('a'))
  get.mockResolvedValueOnce(page([message('c', '000003')], null, 'before-c'))
    .mockResolvedValueOnce(page([message('b', '000002')], null, 'before-b'))
    .mockResolvedValueOnce(page([message('a')])).mockResolvedValueOnce(page([])).mockResolvedValue({ data: message('a') })
  await history.catchUp()
  expect(history.messages.value.map(m => m.id)).toEqual(['a', 'b', 'c'])
  expect(get.mock.calls.slice(1, 4)).toEqual([['/chats/c1/messages'], ['/chats/c1/messages', { before: 'before-c' }], ['/chats/c1/messages', { before: 'before-b' }]])
})
it('resumes an unfinished empty-baseline backward reconciliation after a page failure', async () => {
  get.mockResolvedValueOnce(page([]))
  const history = useChatMessages('c1'); await history.loadInitial()
  history.applySent(message('a'))
  get.mockResolvedValueOnce(page([message('c', '000003')], null, 'before-c'))
    .mockRejectedValueOnce(new Error('offline'))
  await expect(history.catchUp()).rejects.toThrow('offline')
  get.mockResolvedValueOnce(page([message('b', '000002')], null, 'before-b')).mockResolvedValueOnce(page([message('a')]))
    .mockResolvedValueOnce(page([message('d', '000004')])).mockImplementation((url: string) => Promise.resolve({ data: url.endsWith('/a') ? message('a') : message('c', '000003') }))
  await history.catchUp()
  expect(get.mock.calls[3]).toEqual(['/chats/c1/messages', { before: 'before-c' }])
  expect(get.mock.calls[5]).toEqual(['/chats/c1/messages', { after: message('c', '000003').cursor }])
  expect(history.messages.value.map(m => m.id)).toEqual(['a', 'b', 'c', 'd'])
})
