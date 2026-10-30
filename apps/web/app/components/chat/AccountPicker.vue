<script setup lang="ts">
import type { Person, PeopleResponse } from '~/utils/people'
import { apiErrorMessage } from '~/utils/apiError'
const props = withDefaults(defineProps<{ excluded?: string[], disabled?: boolean }>(), { excluded: () => [] })
const emit = defineEmits<{ selected: [ids: string[]] }>()
const api = useApi(), auth = useAuthStore(), { can } = useCan()
const search = ref(''), people = ref<Person[]>([]), selected = ref<Person[]>([])
const loading = ref(false), error = ref(''), page = ref(0), lastPage = ref(0)
const available = computed(() => can('people.view'))
const eligible = (p: Person) => !!p.user_id && p.has_account && !p.archived && !p.account_disabled && p.user_id !== auth.user?.id && !props.excluded.includes(p.user_id)
const options = computed(() => people.value.filter(p => eligible(p) && !selected.value.some(s => s.user_id === p.user_id)))
let revision = 0, timer: ReturnType<typeof setTimeout> | undefined
function publish() { emit('selected', selected.value.flatMap(p => p.user_id ? [p.user_id] : [])) }
function toggle(person: Person) {
  if (props.disabled || !eligible(person)) return
  selected.value = [...selected.value, person]; publish()
}
function remove(person: Person) { selected.value = selected.value.filter(p => p.id !== person.id); publish() }
async function load(next = false) {
  if (!available.value || props.disabled || loading.value || !search.value.trim()) return
  const token = ++revision, session = auth.sessionVersion, target = next ? page.value + 1 : 1
  loading.value = true; error.value = ''
  try {
    const response = await api.get<PeopleResponse>('/people', { search: search.value.trim(), has_account: 1, page: target })
    if (token !== revision || session !== auth.sessionVersion || !available.value) return
    people.value = next ? [...people.value, ...response.data] : response.data
    page.value = target; lastPage.value = response.meta.last_page
  } catch (failure) {
    if (token === revision) error.value = apiErrorMessage(failure, 'Не удалось найти людей. Попробуйте ещё раз.')
  } finally { if (token === revision) loading.value = false }
}
watch([search, available, () => auth.sessionVersion], () => {
  revision++; if (timer) clearTimeout(timer)
  people.value = []; loading.value = false; page.value = 0; lastPage.value = 0; error.value = ''
  if (!available.value) { selected.value = []; publish(); return }
  timer = setTimeout(() => { void load() }, 300)
})
watch(() => props.excluded, () => { selected.value = selected.value.filter(eligible); publish() }, { deep: true })
watch(() => auth.sessionVersion, () => { selected.value = []; search.value = ''; publish() }, { flush: 'sync' })
onBeforeUnmount(() => { revision++; if (timer) clearTimeout(timer) })
</script>
<template>
  <div>
    <p v-if="!available" role="status">Нет права на просмотр справочника. Выбор участников недоступен.</p>
    <template v-else>
      <label>Найти человека<input v-model="search" data-test="search" type="search" maxlength="200" :disabled="disabled"></label>
      <ul aria-label="Выбранные участники"><li v-for="p in selected" :key="p.id">{{ p.full_name }} <button type="button" :disabled="disabled" :aria-label="`Убрать ${p.full_name}`" @click="remove(p)">×</button></li></ul>
      <p v-if="loading" role="status">Поиск…</p>
      <p v-if="error" role="alert">{{ error }} <button type="button" :disabled="loading || disabled" @click="load()">Повторить</button></p>
      <ul aria-label="Результаты поиска"><li v-for="p in options" :key="p.id"><button type="button" :data-test="`option-${p.id}`" :disabled="disabled" @click="toggle(p)">{{ p.full_name }}</button></li></ul>
      <p v-if="page && !options.length && !loading">Других доступных аккаунтов на этой странице нет.</p>
      <button v-if="page < lastPage" type="button" data-test="more-people" :disabled="loading || disabled" @click="load(true)">Ещё</button>
    </template>
  </div>
</template>
