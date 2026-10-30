<script setup lang="ts">
import type { EventSlot } from '~/composables/useEvents'
import type { Assignment, AssignmentResponse, AssignmentWarning, SlotCandidate } from '~/utils/assignments'
import { apiErrorMessage } from '~/utils/apiError'
import CandidateList from './CandidateList.vue'
import WarningList from './WarningList.vue'

const props = defineProps<{ slot: EventSlot, eventId?: string }>()
const emit = defineEmits<{ assigned: [assignment: Assignment, warnings: AssignmentWarning[]], close: [] }>()
const api = useApi(), dialog = ref<HTMLDialogElement>()
const search = ref(''), candidates = ref<SlotCandidate[]>([]), searching = ref(false), searchError = ref('')
const submitting = ref(false), assignError = ref(''), success = ref(false)
const warnings = ref<AssignmentWarning[]>([]), warningConflicts = ref<SlotCandidate['conflicts']>([])
const succeededIds = ref<string[]>([])
const assignedIds = computed(() => [...new Set([...succeededIds.value, ...props.slot.assignments.map(a => a.person.id)])])
const filtered = computed(() => props.slot.role && search.value.trim()
  ? candidates.value.filter(c => c.person.full_name?.toLocaleLowerCase('ru').includes(search.value.trim().toLocaleLowerCase('ru')))
  : candidates.value)
let timer: ReturnType<typeof setTimeout> | undefined
let searchVersion = 0, identityVersion = 0, active = true

function invalidateSearch() {
  clearTimeout(timer); timer = undefined; searchVersion++; searching.value = false
}
async function loadCandidates(query: string, version: number) {
  searching.value = true; searchError.value = ''
  try {
    const result = await api.get<{ data: SlotCandidate[] }>(`/slots/${encodeURIComponent(props.slot.id)}/candidates`, query ? { search: query } : {})
    if (active && version === searchVersion) candidates.value = result.data
  } catch (error) {
    if (active && version === searchVersion) searchError.value = apiErrorMessage(error, 'Не удалось загрузить кандидатов. Попробуйте ещё раз.')
  } finally { if (active && version === searchVersion) searching.value = false }
}
function searchCandidates() {
  invalidateSearch(); candidates.value = []; searchError.value = ''
  if (!props.slot.can_fill) return
  const version = searchVersion, query = search.value.trim()
  if (props.slot.role) { void loadCandidates('', version); return }
  if (query.length >= 2) timer = setTimeout(() => { void loadCandidates(query, version) }, 300)
}
watch(search, () => { if (!props.slot.role) searchCandidates() })
watch([() => props.eventId, () => props.slot.id], () => {
  identityVersion++; invalidateSearch(); search.value = ''; candidates.value = []; searchError.value = ''
  submitting.value = false; assignError.value = ''; success.value = false; warnings.value = []; warningConflicts.value = []; succeededIds.value = []
  searchCandidates()
}, { immediate: true })
watch([() => props.slot.role?.id, () => props.slot.can_fill], () => { searchCandidates() })

async function assign(candidate: SlotCandidate) {
  if (!props.slot.can_fill || submitting.value || assignedIds.value.includes(candidate.person.id)) return
  const version = identityVersion
  submitting.value = true; assignError.value = ''; success.value = false; warnings.value = []
  try {
    const result = await api.post<AssignmentResponse>(`/slots/${encodeURIComponent(props.slot.id)}/assignments`, { person_id: candidate.person.id })
    if (!active || version !== identityVersion) return
    succeededIds.value.push(candidate.person.id); success.value = true
    warnings.value = result.warnings; warningConflicts.value = candidate.conflicts
    emit('assigned', result.data, result.warnings)
  } catch (error) {
    if (active && version === identityVersion) assignError.value = apiErrorMessage(error, 'Не удалось назначить человека. Попробуйте ещё раз.')
  } finally { if (active && version === identityVersion) submitting.value = false }
}
function close() {
  if (submitting.value) return
  active = false; invalidateSearch(); dialog.value?.close(); emit('close')
}
onMounted(() => dialog.value?.showModal())
onBeforeUnmount(() => { active = false; invalidateSearch() })
</script>

<template>
  <dialog ref="dialog" aria-labelledby="assign-title" @cancel.prevent="close">
    <h2 id="assign-title">Назначить: {{ slot.label }}</h2>
    <p v-if="!slot.can_fill" role="status">Назначения этого слота сейчас недоступны.</p>
    <label>Поиск по имени и фамилии
      <input v-model="search" type="search" maxlength="200" data-test="search" :disabled="submitting || !slot.can_fill">
    </label>
    <p v-if="!slot.role && search.trim().length < 2">Введите хотя бы два символа.</p>
    <p v-if="searching" role="status">Загружаем кандидатов…</p>
    <p v-else-if="searchError" role="alert">{{ searchError }} <button type="button" @click="searchCandidates">Повторить</button></p>
    <CandidateList v-else-if="slot.can_fill && (slot.role || search.trim().length >= 2)" :candidates="filtered" :assigned-ids="assignedIds" :disabled="submitting" @select="assign" />
    <div aria-live="polite">
      <p v-if="success" role="status">Назначение создано.</p>
      <WarningList :warnings="warnings" :role-label="slot.role?.name" :conflicts="warningConflicts" />
    </div>
    <p v-if="assignError" role="alert">{{ assignError }}</p>
    <button type="button" data-test="close-assign" :disabled="submitting" @click="close">Закрыть</button>
  </dialog>
</template>

<style scoped>
dialog { width: min(34rem, calc(100% - 4rem)); max-height: calc(100% - 4rem); overflow: auto; border: 1px solid #8b96a6; border-radius: 0.5rem; padding: 1.5rem; }
dialog::backdrop { background: #17213399; }
label { display: flex; flex-direction: column; gap: 0.3rem; margin: 1rem 0; }
input, button { font: inherit; padding: 0.65rem; border: 1px solid #8b96a6; border-radius: 0.3rem; }
button { cursor: pointer; }
button:disabled { opacity: 0.6; cursor: wait; }
[role='alert'] { color: #a32020; }
</style>
