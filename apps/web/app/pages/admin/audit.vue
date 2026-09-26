<script setup lang="ts">
import type { operations } from '~~/types/api'
import { fetchChurchTimezone } from '~/composables/useChurchTimezone'
import { churchDayEndToUtc, churchDayStartToUtc, formatChurchDateTime } from '~/utils/churchTime'

type AuditResponse = operations['access.audit']['responses'][200]['content']['application/json']
type AuditEntry = AuditResponse['data'][number]

// Раздел 6.5 архитектуры: "Чтение по audit.view, фильтры по актору,
// действию, объекту и периоду, курсорная пагинация" — сервер уже принимает
// все четыре измерения (AuditController.php), значит все четыре должны быть
// достижимы с экрана. Актора и объект удобнее ставить щелчком по строке
// журнала, чем вводить идентификатор руками — так и сделано ниже
// (filterByActor/filterBySubject).
const api = useApi()
const { can } = useCan()
const canView = computed(() => can('audit.view'))

const entries = ref<AuditEntry[]>([])
const nextCursor = ref<string | null>(null)
const loading = ref(false)
const loadingMore = ref(false)
const loadError = ref('')

const timezone = ref('UTC')
const actionFilter = ref('')
const actorId = ref<string | null>(null)
const actorName = ref<string | null>(null)
const subjectType = ref<string | null>(null)
const subjectId = ref<string | null>(null)
const fromDate = ref('')
const toDate = ref('')

let requestVersion = 0
let actionTimer: ReturnType<typeof setTimeout> | undefined

function buildQuery(cursor: string | null): URLSearchParams {
  const query = new URLSearchParams()
  if (cursor) query.set('cursor', cursor)
  if (actorId.value) query.set('actor', actorId.value)
  if (actionFilter.value.trim()) query.set('action', actionFilter.value.trim())
  if (subjectType.value && subjectId.value) {
    query.set('subject_type', subjectType.value)
    query.set('subject_id', subjectId.value)
  }
  // Границы суток — в часовом поясе церкви, не машины (раздел 10; тест
  // churchTime.spec.ts проверяет это отдельно для двух непоказательных
  // поясов): экран сам не разбирает даты, только зовёт churchTime.ts.
  if (fromDate.value) query.set('from', churchDayStartToUtc(fromDate.value, timezone.value))
  if (toDate.value) query.set('to', churchDayEndToUtc(toDate.value, timezone.value))
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
    if (version !== requestVersion) return
    entries.value = reset ? response.data : [...entries.value, ...response.data]
    nextCursor.value = response.next_cursor
  } catch {
    if (version !== requestVersion) return
    loadError.value = 'Не удалось загрузить журнал. Попробуйте ещё раз.'
  } finally {
    if (version === requestVersion) {
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

function formatCreatedAt(iso: string) {
  return formatChurchDateTime(iso, timezone.value)
}

// Свободный ввод — с той же задержкой, что поиск в справочнике людей
// (pages/people/index.vue): каждое нажатие клавиши не должно бить по сети.
watch(actionFilter, () => {
  clearTimeout(actionTimer)
  actionTimer = setTimeout(resetList, 300)
})
watch([fromDate, toDate], resetList)
watch(canView, (allowed) => {
  clearTimeout(actionTimer)
  requestVersion++
  entries.value = []
  nextCursor.value = null
  loading.value = false
  loadingMore.value = false
  if (allowed) void load(true)
})
onBeforeUnmount(() => {
  clearTimeout(actionTimer)
  requestVersion++
})

if (canView.value) {
  timezone.value = await fetchChurchTimezone()
  await load(true)
}
</script>

<template>
  <section class="admin-audit">
    <h1>Журнал действий</h1>
    <p v-if="!canView" role="alert">Нет права на просмотр журнала.</p>
    <template v-else>
      <div class="admin-audit__filters">
        <label>
          Действие
          <input v-model="actionFilter" data-test="filter-action" type="text" placeholder="например, person.archived">
        </label>
        <label>
          С
          <input v-model="fromDate" data-test="filter-from" type="date">
        </label>
        <label>
          По
          <input v-model="toDate" data-test="filter-to" type="date">
        </label>
      </div>
      <p v-if="actorId" class="admin-audit__chip" data-test="actor-chip">
        Актор: {{ actorName }}
        <button type="button" data-test="clear-actor" @click="clearActorFilter">×</button>
      </p>
      <p v-if="subjectType" class="admin-audit__chip" data-test="subject-chip">
        Объект: {{ subjectType }} {{ subjectId }}
        <button type="button" data-test="clear-subject" @click="clearSubjectFilter">×</button>
      </p>

      <p v-if="loading" role="status">Загрузка…</p>
      <p v-else-if="loadError" role="alert">
        {{ loadError }} <button type="button" data-test="retry" @click="resetList">Повторить</button>
      </p>
      <template v-else>
        <ul class="admin-audit__list">
          <li v-for="entry in entries" :key="entry.id">
            <p>
              <button
                v-if="entry.actor" type="button" class="admin-audit__link" :data-test="`entry-actor-${entry.id}`"
                @click="filterByActor(entry)"
              >{{ entry.actor.name }}</button>
              <span v-else>Система</span>
              — <strong>{{ entry.action }}</strong>
              <button
                v-if="entry.subject_type && entry.subject_id" type="button" class="admin-audit__link"
                :data-test="`entry-subject-${entry.id}`" @click="filterBySubject(entry)"
              >{{ entry.subject_type }} {{ entry.subject_id }}</button>
            </p>
            <p class="admin-audit__meta">{{ formatCreatedAt(entry.created_at) }}</p>
          </li>
        </ul>
        <p v-if="!entries.length">Записей не найдено.</p>
        <button v-if="nextCursor" type="button" data-test="load-more" :disabled="loadingMore" @click="loadMore">
          {{ loadingMore ? 'Загрузка…' : 'Показать ещё' }}
        </button>
      </template>
    </template>
  </section>
</template>

<style scoped>
.admin-audit { max-width: 48rem; margin: 0 auto; color: #202b3a; }
.admin-audit__filters { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
.admin-audit__filters label { display: flex; flex-direction: column; gap: 0.3rem; }
.admin-audit__chip { display: inline-flex; align-items: center; gap: 0.4rem; background: #edf1f6; padding: 0.4rem 0.7rem; border-radius: 999px; margin: 0 0.5rem 0.5rem 0; }
.admin-audit__chip button { border: 0; background: none; cursor: pointer; font: inherit; }
.admin-audit__list { list-style: none; padding: 0; margin: 0; }
.admin-audit__list li { padding: 0.75rem 0; border-bottom: 1px solid #dfe4ea; }
.admin-audit__meta { color: #4b5563; }
.admin-audit__link { border: 0; background: none; padding: 0; font: inherit; text-decoration: underline; cursor: pointer; }
input, button { font: inherit; padding: 0.55rem; border: 1px solid #8b96a6; border-radius: 0.3rem; }
button { cursor: pointer; }
button:disabled { opacity: 0.6; cursor: wait; }
[role='alert'] { color: #a32020; }
</style>
