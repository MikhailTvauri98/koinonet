<script setup lang="ts">
import type { EventSlot } from '~/composables/useEvents'
import type { Assignment, AssignmentResponse, AssignmentWarning, SlotCandidate } from '~/utils/assignments'
import { apiErrorMessage } from '~/utils/apiError'
import CandidateList from './CandidateList.vue'
import WarningList from './WarningList.vue'

const props = defineProps<{ slot: EventSlot, eventId?: string, disabled?: boolean }>()
const emit = defineEmits<{ assigned: [assignment: Assignment, warnings: AssignmentWarning[]], close: [] }>()
const api = useApi(), auth = useAuthStore(), { can } = useCan()
const open = ref(true)
const search = ref(''), candidates = ref<SlotCandidate[]>([]), searching = ref(false), searchError = ref('')
const submitting = ref(false), assignError = ref(''), success = ref(false)
const warnings = ref<AssignmentWarning[]>([]), warningConflicts = ref<SlotCandidate['conflicts']>([])
const warningRole = ref<{ id: string, name: string }>()
const warningRoleLabel = computed(() => warningRole.value?.id === props.slot.role?.id ? warningRole.value?.name : undefined)
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
  if (!active || !props.slot.can_fill) return
  const version = searchVersion, query = search.value.trim()
  if (props.slot.role) { void loadCandidates('', version); return }
  if (!query) { void loadCandidates('', version); return }
  if (query.length >= 2) {
    searching.value = true
    timer = setTimeout(() => { void loadCandidates(query, version) }, 300)
  }
}
watch(search, () => { if (!props.slot.role) searchCandidates() })
watch([() => props.eventId, () => props.slot.id], () => {
  identityVersion++; invalidateSearch(); search.value = ''; candidates.value = []; searchError.value = ''
  submitting.value = false; assignError.value = ''; success.value = false; warnings.value = []; warningConflicts.value = []; succeededIds.value = []
  searchCandidates()
}, { immediate: true })
watch(() => props.slot.role?.id, searchCandidates)
watch(() => props.slot.can_fill, (allowed) => { if (!allowed) dismiss(); else searchCandidates() }, { flush: 'sync' })
watch(() => can('people.view'), (allowed, previous) => { if (previous && !allowed) dismiss() }, { flush: 'sync' })
watch(() => auth.sessionVersion, dismiss, { flush: 'sync' })

async function assign(candidate: SlotCandidate) {
  if (!active || props.disabled || !props.slot.can_fill || submitting.value || assignedIds.value.includes(candidate.person.id)) return
  const version = identityVersion
  const role = props.slot.role
  submitting.value = true; assignError.value = ''; success.value = false; warnings.value = []
  try {
    const result = await api.post<AssignmentResponse>(`/slots/${encodeURIComponent(props.slot.id)}/assignments`, { person_id: candidate.person.id })
    if (!active || version !== identityVersion) return
    succeededIds.value.push(candidate.person.id); success.value = true
    warnings.value = result.warnings; warningConflicts.value = candidate.conflicts; warningRole.value = role ? { id: role.id, name: role.name } : undefined
    emit('assigned', result.data, result.warnings)
  } catch (error) {
    if (active && version === identityVersion) assignError.value = apiErrorMessage(error, 'Не удалось назначить человека. Попробуйте ещё раз.')
  } finally { if (active && version === identityVersion) submitting.value = false }
}
function dismiss() {
  if (!active) return
  active = false; open.value = false; identityVersion++; invalidateSearch(); candidates.value = []; warnings.value = []; warningConflicts.value = []; success.value = false; assignError.value = ''; searchError.value = ''; succeededIds.value = []; search.value = ''; submitting.value = false
  emit('close')
}
function close() { if (!submitting.value) dismiss() }
onBeforeUnmount(() => { active = false; invalidateSearch() })
</script>

<template>
  <UiDialog :open="open" :label="`Назначить: ${slot.label}`" @close="close">
    <h2 id="assign-title">Назначить: {{ slot.label }}</h2>
    <p v-if="!slot.can_fill" role="status">Назначения этого слота сейчас недоступны.</p>
    <p v-if="disabled" role="status">Выбор недоступен до обновления состава. Закройте окно и при ошибке нажмите «Повторить загрузку» в карточке события.</p>
    <label>Поиск по имени и фамилии
      <input v-model="search" type="search" maxlength="200" autofocus data-test="search" :disabled="disabled || submitting || !slot.can_fill">
    </label>
    <p v-if="!slot.role && search.trim().length === 1">Введите хотя бы два символа.</p>
    <p v-if="searching" role="status">Загружаем кандидатов…</p>
    <p v-else-if="searchError" role="alert">{{ searchError }} <button type="button" @click="searchCandidates">Повторить</button></p>
    <CandidateList v-else-if="slot.can_fill && (slot.role || search.trim().length !== 1)" :candidates="filtered" :assigned-ids="assignedIds" :disabled="disabled || submitting" @select="assign" />
    <div aria-live="polite">
      <p v-if="success" role="status">Назначение создано.</p>
      <WarningList :warnings="warnings" :role-label="warningRoleLabel" :conflicts="warningConflicts" />
    </div>
    <p v-if="assignError" role="alert">{{ assignError }}</p>
    <template #actions>
      <button type="button" data-test="close-assign" :disabled="submitting" @click="close">Закрыть</button>
    </template>
  </UiDialog>
</template>

<style scoped>
h2 { font-size: 1.25rem; overflow-wrap: anywhere; }
label { display: grid; gap: var(--ui-space-2); margin-block: var(--ui-space-4); }
[role='alert'] { color: var(--ui-danger); }
</style>
