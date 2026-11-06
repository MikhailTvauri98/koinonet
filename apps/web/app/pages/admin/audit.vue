<script setup lang="ts">
import PageHeader from '~/components/ui/PageHeader.vue'
import FormSection from '~/components/ui/FormSection.vue'
import type { operations } from '~~/types/api'
import { fetchChurchTimezone } from '~/composables/useChurchTimezone'
import { apiErrorMessage } from '~/utils/apiError'
import { AUDIT_ACTION_LABELS, auditActionLabel, auditSubjectLabel } from '~/utils/audit'
import { churchDayEndToUtc, churchDayStartToUtc } from '~/utils/churchTime'

type AuditResponse = operations['access.audit']['responses'][200]['content']['application/json']
type AuditEntry = AuditResponse['data'][number]

// Раздел 6.5 архитектуры: "Чтение по audit.view, фильтры по актору,
// действию, объекту и периоду, курсорная пагинация" — сервер уже принимает
// все четыре измерения (AuditController.php), значит все четыре должны быть
// достижимы с экрана. Актора и объект удобнее ставить щелчком по строке
// журнала, чем вводить идентификатор руками — так и сделано ниже
// (filterByActor/filterBySubject).
const api = useApi()
const auth = useAuthStore()
let active = true
const { can } = useCan()
const canView = computed(() => can('audit.view'))

const entries = ref<AuditEntry[]>([])
const nextCursor = ref<string | null>(null)
const loading = ref(false)
const loadingMore = ref(false)
const loadError = ref('')

const settings = useSettingsStore()
const { formatDateTime } = useChurchDate()
const actionFilter = ref('')
const actorId = ref<string | null>(null)
const actorName = ref<string | null>(null)
const subjectType = ref<string | null>(null)
const subjectId = ref<string | null>(null)
const fromDate = ref('')
const toDate = ref('')

let requestVersion = 0
// Какую загрузку повторяет «Повторить»: первую страницу по фильтрам или
// следующую по курсору. Сбой «Показать ещё» не прячет уже загруженное.
let failedReset = true

function buildQuery(cursor: string | null): URLSearchParams {
  const query = new URLSearchParams()
  if (cursor) query.set('cursor', cursor)
  if (actorId.value) query.set('actor', actorId.value)
  if (actionFilter.value) query.set('action', actionFilter.value)
  if (subjectType.value && subjectId.value) {
    query.set('subject_type', subjectType.value)
    query.set('subject_id', subjectId.value)
  }
  // Границы суток — в часовом поясе церкви, не машины (раздел 10; тест
  // churchTime.spec.ts проверяет это отдельно для двух непоказательных
  // поясов): экран сам не разбирает даты, только зовёт churchTime.ts.
  if (fromDate.value) query.set('from', churchDayStartToUtc(fromDate.value, settings.timezone))
  if (toDate.value) query.set('to', churchDayEndToUtc(toDate.value, settings.timezone))
  return query
}

async function load(reset: boolean) {
  if (!canView.value) return
  const version = ++requestVersion
  if (reset) {
    entries.value = []
    nextCursor.value = null
    loading.value = true
  } else {
    loadingMore.value = true
  }
  loadError.value = ''
  try {
    const query = buildQuery(reset ? null : nextCursor.value)
    const response = await api.get<AuditResponse>(`/audit?${query}`)
    // Смена фильтра посреди загрузки не должна дописать запоздавший ответ
    // старого фильтра к уже показанному новому списку (решение контроллера,
    // бриф задачи 30).
    if (!active || version !== requestVersion) return
    entries.value = reset ? response.data : [...entries.value, ...response.data]
    nextCursor.value = response.next_cursor
  } catch (error) {
    if (!active || version !== requestVersion) return
    failedReset = reset
    loadError.value = apiErrorMessage(error, 'Не удалось загрузить журнал. Попробуйте ещё раз.')
  } finally {
    if (active && version === requestVersion) {
      loading.value = false
      loadingMore.value = false
    }
  }
}

function resetList() {
  void load(true)
}

function filterByActor(entry: AuditEntry) {
  if (!entry.actor) return
  actorId.value = entry.actor.id
  actorName.value = entry.actor.name
  resetList()
}

function clearActorFilter() {
  actorId.value = null
  actorName.value = null
  resetList()
}

function filterBySubject(entry: AuditEntry) {
  if (!entry.subject_type || !entry.subject_id) return
  subjectType.value = entry.subject_type
  subjectId.value = entry.subject_id
  resetList()
}

function clearSubjectFilter() {
  subjectType.value = null
  subjectId.value = null
  resetList()
}

function loadMore() {
  if (!nextCursor.value || loading.value || loadingMore.value) return
  void load(false)
}

function retry() {
  void load(failedReset)
}

function formatCreatedAt(iso: string) {
  return formatDateTime(iso)
}

watch([actionFilter, fromDate, toDate], resetList)
watch([() => auth.sessionVersion, canView], () => {
  const allowed = canView.value
  actorId.value = null; actorName.value = null; subjectId.value = null; subjectType.value = null
  loadError.value = ''
  requestVersion++
  entries.value = []
  nextCursor.value = null
  loading.value = false
  loadingMore.value = false
  if (allowed) void load(true)
}, { flush: 'sync' })
onBeforeUnmount(() => {
  active = false
  requestVersion++
})

if (canView.value) {
  await fetchChurchTimezone()
  await load(true)
}
</script>

<template>
  <section class="admin-audit">
    <PageHeader title="Журнал действий" description="Действия пользователей и системы с фильтрами по периоду, автору и объекту." />
    <p v-if="!canView" role="alert">Нет права на просмотр журнала.</p>
    <template v-else>
      <FormSection title="Фильтры журнала" :description="`Период включительно, часовой пояс церкви: ${settings.timezone}.`">
      <div class="admin-audit__filters">
        <label>
          Действие
          <select v-model="actionFilter" data-test="filter-action">
            <option value="">Все действия</option>
            <option v-for="(label, code) in AUDIT_ACTION_LABELS" :key="code" :value="code">{{ label }}</option>
          </select>
        </label>
        <label>
          Начало периода
          <input v-model="fromDate" data-test="filter-from" type="date">
        </label>
        <label>
          Конец периода
          <input v-model="toDate" data-test="filter-to" type="date">
        </label>
      </div>
      </FormSection>
      <p v-if="actorId" class="admin-audit__chip" data-test="actor-chip">
        Кто: {{ actorName }}
        <button type="button" aria-label="Сбросить фильтр по автору" data-test="clear-actor" @click="clearActorFilter">×</button>
      </p>
      <p v-if="subjectType" class="admin-audit__chip" data-test="subject-chip">
        Объект: {{ auditSubjectLabel(subjectType) }} {{ subjectId }}
        <button type="button" aria-label="Сбросить фильтр по объекту" data-test="clear-subject" @click="clearSubjectFilter">×</button>
      </p>

      <p v-if="loading" role="status">Загрузка…</p>
      <template v-else>
        <ul class="admin-audit__list">
          <li v-for="entry in entries" :key="entry.id">
            <p>
              <button
                v-if="entry.actor" type="button" class="admin-audit__link" :data-test="`entry-actor-${entry.id}`"
                @click="filterByActor(entry)"
              >{{ entry.actor.name }}</button>
              <span v-else>Система</span>
              — <strong>{{ auditActionLabel(entry.action) }}</strong>
              <button
                v-if="entry.subject_type && entry.subject_id" type="button" class="admin-audit__link"
                :data-test="`entry-subject-${entry.id}`" @click="filterBySubject(entry)"
              >{{ auditSubjectLabel(entry.subject_type) }} {{ entry.subject_id }}</button>
            </p>
            <p class="admin-audit__meta"><time :datetime="entry.created_at">{{ formatCreatedAt(entry.created_at) }}</time></p>
          </li>
        </ul>
        <p v-if="!entries.length && !loadError">Записей не найдено.</p>
        <p v-if="loadError" role="alert">
          {{ loadError }} <button type="button" data-test="retry" @click="retry">Повторить</button>
        </p>
        <button v-else-if="nextCursor" type="button" data-test="load-more" :disabled="loadingMore" @click="loadMore">
          {{ loadingMore ? 'Загрузка…' : 'Показать ещё' }}
        </button>
      </template>
    </template>
  </section>
</template>

<style scoped>
.admin-audit { min-width: 0; color: var(--ui-text); overflow-wrap: anywhere; }
.admin-audit__filters { display: flex; gap: var(--ui-space-4); flex-wrap: wrap; min-width: 0; }
.admin-audit__filters label { display: grid; gap: var(--ui-space-2); flex: 1 1 11rem; min-width: 0; max-width: 100%; }
.admin-audit__filters label:first-child { flex-basis: 18rem; }
.admin-audit__filters select, .admin-audit__filters input { width: 100%; max-width: 100%; }
.admin-audit__chip { display: inline-flex; flex-wrap: wrap; max-width: 100%; align-items: center; gap: var(--ui-space-2); background: var(--ui-surface-muted); padding: var(--ui-space-2) var(--ui-space-3); border-radius: 14px; margin: var(--ui-space-3) var(--ui-space-2) var(--ui-space-3) 0; }
.admin-audit__chip button { min-width: 44px; }
.admin-audit__list { list-style: none; padding: 0; margin: var(--ui-space-6) 0; }
.admin-audit__list li { padding: var(--ui-space-4); border: 1px solid var(--ui-border); border-radius: 14px; background: var(--ui-surface); margin-bottom: var(--ui-space-3); }
.admin-audit__list p { margin: 0; }
.admin-audit__meta { color: var(--ui-text-muted); font-size: .875rem; margin-top: var(--ui-space-2) !important; }
.admin-audit__link { color: var(--ui-accent); text-decoration: underline; text-underline-offset: .2em; }
button { max-width: 100%; white-space: normal; overflow-wrap: anywhere; }
</style>
