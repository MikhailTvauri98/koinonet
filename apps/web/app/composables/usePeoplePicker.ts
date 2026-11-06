import type { MaybeRefOrGetter } from 'vue'
import type { Person, PeopleResponse } from '~/utils/people'
import { apiErrorMessage, apiErrorStatus } from '~/utils/apiError'

export interface PeoplePickerOptions {
  mode: MaybeRefOrGetter<'people' | 'accounts'>
  excludedIds?: MaybeRefOrGetter<string[]>
  disabled?: MaybeRefOrGetter<boolean>
}

/** A mounted picker belongs to one account session; reopening creates a fresh preview. */
export function usePeoplePicker(options: PeoplePickerOptions) {
  const api = useApi(), auth = useAuthStore(), { can } = useCan()
  const session = auth.sessionVersion
  const search = ref(''), people = ref<Person[]>([])
  const loading = ref(false), error = ref(''), page = ref(0), lastPage = ref(0)
  const available = computed(() => can('people.view') && session === auth.sessionVersion)
  const disabled = computed(() => !!toValue(options.disabled))
  const candidates = computed(() => people.value.filter(person => !person.archived
    && !toValue(options.excludedIds)?.includes(person.id)
    && (toValue(options.mode) === 'people' || (person.has_account && !!person.user_id
      && !person.account_disabled && person.user_id !== auth.user?.id))))
  const hasMore = computed(() => page.value < lastPage.value)
  let generation = 0, active = true, timer: ReturnType<typeof setTimeout> | undefined
  let retryPage = 1

  function invalidate(clear = true) {
    generation++
    if (timer) clearTimeout(timer)
    timer = undefined
    loading.value = false
    if (clear) { people.value = []; page.value = 0; lastPage.value = 0; error.value = ''; retryPage = 1 }
  }
  async function load(target = 1) {
    if (!active || !available.value || disabled.value) return
    const token = ++generation
    loading.value = true; error.value = ''; retryPage = target
    const query = search.value.trim()
    try {
      const response = await api.get<PeopleResponse>('/people', {
        ...(query ? { search: query } : {}),
        ...(toValue(options.mode) === 'accounts' ? { has_account: 1 } : {}),
        per_page: 20, page: target,
      })
      if (!active || token !== generation || !available.value) return
      // A repeated row on a later page updates the record without duplicating it.
      people.value = [...new Map([...(target > 1 ? people.value : []), ...response.data].map(person => [person.id, person])).values()]
      page.value = target; lastPage.value = response.meta.last_page
    } catch (failure) {
      if (!active || token !== generation || !available.value) return
      if ([401, 403].includes(apiErrorStatus(failure) ?? 0)) {
        people.value = []; page.value = 0; lastPage.value = 0; retryPage = 1
      }
      error.value = apiErrorMessage(failure, 'Не удалось найти людей. Попробуйте ещё раз.')
    } finally { if (active && token === generation) loading.value = false }
  }
  watch([search, () => toValue(options.mode), available], () => {
    invalidate()
    if (!available.value || disabled.value) return
    if (!search.value.trim()) { void load(); return }
    loading.value = true
    timer = setTimeout(() => { timer = undefined; void load() }, 300)
  }, { immediate: true, flush: 'sync' })
  watch(disabled, (value) => {
    invalidate(false)
    if (!value && !page.value && available.value) void load()
  }, { flush: 'sync' })
  onBeforeUnmount(() => { active = false; invalidate() })
  return { search, people, candidates, loading, error, page, available, hasMore,
    retry: () => load(retryPage), more: () => { if (hasMore.value && !loading.value) return load(page.value + 1) } }
}
