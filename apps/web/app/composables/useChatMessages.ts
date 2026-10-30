import type { components } from '~~/types/api'
import { apiErrorStatus } from '~/utils/apiError'

export type ChatMessage = components['schemas']['MessageResource']
type Page = { data: ChatMessage[], next_before: string | null, next_after: string | null }
const time = (value: string) => value.replace(/(?:\.(\d+))?Z$/, (_, fraction = '') => `.${fraction.padEnd(6, '0')}Z`)
export function compareMessages(a: Pick<ChatMessage, 'created_at' | 'id'>, b: Pick<ChatMessage, 'created_at' | 'id'>) {
  const first = `${time(a.created_at)}|${a.id}`
  const second = `${time(b.created_at)}|${b.id}`
  return first < second ? -1 : first > second ? 1 : 0
}

// One instance belongs to one chat/account lifetime. Revisions protect against
// snapshots and ID-only invalidations overtaking each other; cursors stay opaque.
export function useChatMessages(chatId: string, forbidden: () => void = () => {}) {
  const api = useApi()
  const records = new Map<string, ChatMessage>()
  const revisions = new Map<string, number>()
  const tombstones = new Set<string>()
  const messages = shallowRef<ChatMessage[]>([])
  const hasOlder = ref(false)
  const loadingOlder = ref(false)
  let before: string | null = null
  let revision = 0
  let generation = 0
  let disposed = false
  let gapCursor: string | undefined
  let emptyReconciliation: 'initial' | 'older' | undefined
  let olderRequest: Promise<void> | undefined
  let catching: Promise<void> | undefined
  const publish = () => {
    messages.value = [...records.values()].map(message => message.reply_to && tombstones.has(message.reply_to.id)
      ? { ...message, reply_to: { id: message.reply_to.id, deleted: true, sender_name: null, body_preview: null } }
      : message).sort(compareMessages)
  }
  function deleted(message: ChatMessage): ChatMessage { return { ...message, deleted: true, body: null, attachments: [], reply_to: null } }
  function merge(message: ChatMessage, snapshot = Infinity) {
    if (disposed || message.chat_id !== chatId) return
    if (message.deleted) {
      tombstones.add(message.id)
      records.set(message.id, deleted(records.get(message.id) ?? message))
      revisions.set(message.id, ++revision)
      return
    }
    if ((revisions.get(message.id) ?? 0) > snapshot && (records.has(message.id) || !tombstones.has(message.id))) return
    records.set(message.id, tombstones.has(message.id) || message.deleted ? deleted(message) : message)
    if (message.deleted) tombstones.add(message.id)
  }
  function applySent(message: ChatMessage) {
    if (disposed || message.chat_id !== chatId) return
    merge(message); revisions.set(message.id, ++revision); publish()
  }
  function applyDeleted(id: string) {
    if (disposed) return
    tombstones.add(id); revisions.set(id, ++revision)
    const previous = records.get(id)
    if (previous) records.set(id, deleted(previous))
    publish()
  }
  function dispose() {
    disposed = true; generation++; records.clear(); revisions.clear(); tombstones.clear()
    messages.value = []; hasOlder.value = false; loadingOlder.value = false
  }
  function failure(error: unknown) {
    if (apiErrorStatus(error) === 403) { dispose(); forbidden() }
    throw error
  }
  async function loadInitial() {
    const session = generation; const snapshot = revision
    try {
      const page = await api.get<Page>(`/chats/${chatId}/messages`)
      if (disposed || session !== generation) return
      page.data.forEach(m => merge(m, snapshot)); before = page.next_before; hasOlder.value = !!before
      gapCursor = page.data.at(-1)?.cursor; publish()
    } catch (error) { if (!disposed && session === generation) failure(error) }
  }
  async function fetchOlder() {
    const session = generation; const snapshot = revision
    loadingOlder.value = true
    try {
      const page = await api.get<Page>(`/chats/${chatId}/messages`, { before })
      if (disposed || session !== generation) return
      page.data.forEach(m => merge(m, snapshot)); before = page.next_before; hasOlder.value = !!before; publish()
    } catch (error) { if (!disposed && session === generation) failure(error) }
    finally { if (session === generation) loadingOlder.value = false }
  }
  function loadOlder() {
    if (olderRequest) return olderRequest
    if (!before || disposed) return Promise.resolve()
    olderRequest = fetchOlder().finally(() => { olderRequest = undefined })
    return olderRequest
  }
  async function hydrate(id: string) {
    if (disposed || tombstones.has(id)) return
    const session = generation
    const request = ++revision
    revisions.set(id, request)
    try {
      const result = await api.get<{ data: ChatMessage }>(`/messages/${id}`)
      if (disposed || session !== generation || result.data.id !== id) return
      if (!result.data.deleted && revisions.get(id) !== request) return
      merge(result.data, request); publish()
    } catch (error) { if (!disposed && session === generation && revisions.get(id) === request) failure(error) }
  }
  async function reconnect() {
    const session = generation
    const known = [...records.keys()]
    let after = gapCursor
    if (!after || emptyReconciliation) {
      // A confirmed empty/new chat has no server cursor to resume from. A
      // latest-page-only refresh would lose the beginning of a >page gap.
      emptyReconciliation ??= 'initial'
      if (emptyReconciliation === 'initial') { await loadInitial(); emptyReconciliation = 'older' }
      while (!disposed && session === generation && hasOlder.value) await loadOlder()
      emptyReconciliation = undefined
      after = gapCursor
      if (!after) return
    }
    const seen = new Set<string>()
    do {
      if (disposed || session !== generation || seen.has(after)) return
      seen.add(after)
      const snapshot = revision
      const page: Page = await api.get<Page>(`/chats/${chatId}/messages`, { after })
      if (disposed || session !== generation) return
      page.data.forEach(m => merge(m, snapshot)); publish()
      gapCursor = page.data.at(-1)?.cursor ?? after
      after = page.next_after ?? undefined
    } while (after)
    // after only finds new rows. Rehydrate the already loaded window to repair
    // edits/deletions whose broadcasts were missed during the disconnection.
    for (const id of known) {
      if (disposed || session !== generation) return
      await hydrate(id)
    }
  }
  function catchUp() {
    if (disposed) return Promise.resolve()
    if (!catching) catching = reconnect().catch(error => { if (!disposed) failure(error) }).finally(() => { catching = undefined })
    return catching
  }
  return { messages, hasOlder, loadingOlder, loadInitial, loadOlder, catchUp, hydrate, applySent, applyEdited: applySent, applyDeleted, dispose }
}
