import type { Person } from '~/utils/people'
import { apiErrorMessage } from '~/utils/apiError'

export function isDirectChatTarget(person: Person | null, ownUserId?: string) {
  return !!person?.has_account && !!person.user_id && person.user_id !== ownUserId && !person.archived && !person.account_disabled
}

/** A confirmed write belongs to this mounted session and is reused for navigation retries. */
export function useStartDirectChat(context: () => string = () => '') {
  const api = useApi(), auth = useAuthStore(), { can } = useCan()
  const pending = ref(false), error = ref('')
  const allowed = computed(() => !!auth.user && can('people.view') && can('chats.dm'))
  let active = true, generation = 0
  let confirmed: { userId: string, chatId: string } | null = null
  function reset() { generation++; pending.value = false; error.value = ''; confirmed = null }
  watch([context, () => auth.sessionVersion, () => auth.user?.id, allowed], reset, { flush: 'sync' })
  onBeforeUnmount(() => { active = false; reset() })
  async function start(userId: string): Promise<string | null> {
    if (!active || !allowed.value || !userId || userId === auth.user?.id || pending.value) return null
    if (confirmed?.userId === userId) return confirmed.chatId
    const token = ++generation, session = auth.sessionVersion
    const current = () => active && token === generation && session === auth.sessionVersion && allowed.value
    pending.value = true; error.value = ''; confirmed = null
    try {
      const result = await api.post<{ data: { id: string } }>('/chats', { type: 'direct', user_id: userId })
      if (!current()) return null
      confirmed = { userId, chatId: result.data.id }
      return result.data.id
    } catch (failure) {
      if (current()) error.value = apiErrorMessage(failure, 'Не удалось открыть личный чат. Попробуйте ещё раз.')
      return null
    } finally { if (current()) pending.value = false }
  }
  return { pending, error, start }
}

/** All entry points separate a successful POST from a failed route transition. */
export function useDirectChatNavigation(context: () => string = () => '') {
  const auth = useAuthStore(), router = useRouter(), { can } = useCan()
  const starter = useStartDirectChat(context)
  const navigating = ref(false), navigationError = ref(''), confirmedId = ref('')
  const allowed = computed(() => !!auth.user && can('people.view') && can('chats.dm'))
  const pending = computed(() => starter.pending.value || navigating.value)
  const error = computed(() => navigationError.value || starter.error.value)
  let active = true, generation = 0
  function reset() { generation++; navigating.value = false; navigationError.value = ''; confirmedId.value = '' }
  watch([context, () => auth.sessionVersion, () => auth.user?.id, allowed], reset, { flush: 'sync' })
  onBeforeUnmount(() => { active = false; reset() })
  async function open(userId: string) {
    if (!active || !allowed.value || pending.value) return
    const token = ++generation, session = auth.sessionVersion
    const current = () => active && token === generation && session === auth.sessionVersion && allowed.value
    navigationError.value = ''
    const id = await starter.start(userId)
    if (!id || !current()) return
    confirmedId.value = id; navigating.value = true
    try {
      const failure = await router.push(`/chats/${encodeURIComponent(id)}`)
      if (failure) throw failure
    } catch {
      if (current()) navigationError.value = 'Не удалось перейти в чат. Попробуйте открыть его ещё раз.'
    } finally { if (current()) navigating.value = false }
  }
  return { pending, error, confirmedId, open }
}
