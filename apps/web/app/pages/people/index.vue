<script setup lang="ts">
import type { components } from '~~/types/api'
import LoadingState from '~/components/ui/LoadingState.vue'
import EmptyState from '~/components/ui/EmptyState.vue'
import PersonForm from '~/components/people/PersonForm.vue'
import PersonListItem from '~/components/people/PersonListItem.vue'
import { personStatuses, type Person, type PersonStatus, type PeopleResponse, type PersonCreatedResponse } from '~/utils/people'
import { apiErrorMessage, apiErrorStatus } from '~/utils/apiError'

const api = useApi()
const auth = useAuthStore()
const { can } = useCan()
const canView = computed(() => can('people.view'))
const canManage = computed(() => can('people.manage'))
const filtered = computed(() => !!(search.value.trim() || status.value || ministry.value || archived.value || withoutRoles.value))
const emptyDescription = computed(() => !filtered.value && canManage.value ? 'Создайте человека кнопкой «Создать человека».' : 'Измените поиск или фильтры, чтобы увидеть доступных людей.')
const people = ref<Person[]>([])
const ministries = ref<components['schemas']['MinistryResource'][]>([])
const search = ref('')
const status = ref<PersonStatus | ''>('')
const ministry = ref('')
const archived = ref(false)
const withoutRoles = ref(false)
const loading = ref(false)
const errorMessage = ref('')
const ministryError = ref('')
const currentPage = ref(0)
const lastPage = ref(0)
const showForm = ref(false)
const createButton = ref<HTMLButtonElement>()
const created = ref<PersonCreatedResponse | null>(null)
let requestVersion = 0
let ministryVersion = 0
let failedPage = 1
let resettingFilters = false
let searchTimer: ReturnType<typeof setTimeout> | undefined

async function loadPeople(page = 1) {
  if (!canView.value) return
  const version = ++requestVersion
  loading.value = true
  errorMessage.value = ''
  const query = new URLSearchParams({ page: String(page) })
  if (search.value.trim()) query.set('search', search.value.trim())
  if (status.value) query.set('status', status.value)
  if (ministry.value) query.set('ministry', ministry.value)
  if (archived.value) query.set('archived', '1')
  if (withoutRoles.value) query.set('without_roles', '1')
  try {
    const response = await api.get<PeopleResponse>(`/people?${query}`)
    if (version !== requestVersion || !canView.value) return
    // Повторяющаяся запись возможна при изменениях списка между страницами.
    people.value = [...new Map([
      ...(page === 1 ? [] : people.value), ...response.data,
    ].map(person => [person.id, person])).values()]
    currentPage.value = response.meta.current_page
    lastPage.value = response.meta.last_page
  } catch (error) {
    if (version !== requestVersion || !canView.value) return
    errorMessage.value = apiErrorMessage(error, 'Не удалось загрузить людей. Попробуйте ещё раз.')
    failedPage = page
    if ([401, 403].includes(apiErrorStatus(error) ?? 0)) {
      people.value = []
      currentPage.value = 0
      lastPage.value = 0
      failedPage = 1
    }
  } finally {
    if (version === requestVersion) loading.value = false
  }
}

async function loadMinistries() {
  const version = ++ministryVersion
  ministryError.value = ''
  try {
    const response = await api.get<{ data: components['schemas']['MinistryResource'][] }>('/ministries')
    if (version === ministryVersion && canView.value) ministries.value = response.data
  } catch (error) {
    if (version === ministryVersion && canView.value) ministryError.value = apiErrorMessage(error, 'Не удалось загрузить служения для фильтра.')
  }
}

function resetList() {
  if (resettingFilters) return
  clearTimeout(searchTimer)
  people.value = []
  currentPage.value = 0
  lastPage.value = 0
  void loadPeople()
}

watch(search, () => {
  if (resettingFilters) return
  clearTimeout(searchTimer)
  // Старая выдача и запоздавший ответ больше не соответствуют введённому поиску.
  requestVersion++
  people.value = []
  currentPage.value = 0
  lastPage.value = 0
  errorMessage.value = ''
  loading.value = true
  searchTimer = setTimeout(() => { void loadPeople() }, 300)
}, { flush: 'sync' })
watch([status, ministry, archived, withoutRoles], resetList, { flush: 'sync' })
watch(canManage, (allowed) => { if (!allowed) showForm.value = false }, { flush: 'sync' })
watch([canView, () => auth.sessionVersion], ([allowed, session], [, previousSession]) => {
  if (session !== previousSession) {
    resettingFilters = true
    search.value = ''; status.value = ''; ministry.value = ''; archived.value = false; withoutRoles.value = false
    resettingFilters = false
  }
  clearTimeout(searchTimer)
  requestVersion++
  ministryVersion++
  people.value = []
  ministries.value = []
  created.value = null
  showForm.value = false
  loading.value = false
  errorMessage.value = ''
  ministryError.value = ''
  currentPage.value = 0
  lastPage.value = 0
  if (allowed) {
    void loadPeople()
    void loadMinistries()
  }
}, { flush: 'sync' })
onBeforeUnmount(() => {
  clearTimeout(searchTimer)
  requestVersion++
  ministryVersion++
})

async function focusCreate() { await nextTick(); createButton.value?.focus() }
async function cancelCreate() { showForm.value = false; await focusCreate() }

function onCreated(response: PersonCreatedResponse) {
  if (!canView.value) return
  created.value = response
  showForm.value = false
  void focusCreate()
  clearTimeout(searchTimer)
  void loadPeople()
}

if (canView.value) await Promise.all([loadPeople(), loadMinistries()])
</script>

<template>
  <section class="people-page">
    <header>
      <h1>Люди</h1>
      <button
        v-if="canView && canManage && !showForm" ref="createButton" class="ui-button ui-button--primary" type="button" data-test="create-person"
        @click="showForm = true; created = null"
      >Создать человека</button>
    </header>
    <p v-if="!canView" role="alert">Нет права на просмотр справочника.</p>
    <template v-else>
      <div v-if="created" role="status" class="people-page__notice">
        <p>Человек создан. Если запись не видна, проверьте фильтры.</p>
        <ul v-if="created.warnings.length" data-test="warnings">
          <li v-for="warning in created.warnings" :key="warning.code">{{ warning.message }}</li>
        </ul>
      </div>
      <PersonForm v-if="showForm && canManage" @created="onCreated" @cancel="cancelCreate" />
      <div class="people-page__filters">
        <label class="people-page__search">
          Поиск по имени и фамилии
          <input v-model="search" type="search" maxlength="200" data-test="search" placeholder="Имя или фамилия">
        </label>
        <label>
          Статус человека
          <select v-model="status" data-test="filter-status">
            <option value="">Все статусы</option>
            <option v-for="(label, value) in personStatuses" :key="value" :value="value">{{ label }}</option>
          </select>
        </label>
        <label>
          Служение
          <select v-model="ministry" data-test="filter-ministry">
            <option value="">Все люди</option>
            <option v-for="item in ministries" :key="item.id" :value="item.id">{{ item.name }}</option>
          </select>
        </label>
        <label class="people-page__checkbox">
          <input v-model="archived" type="checkbox" data-test="filter-archived"> Только архивные
        </label>
        <label class="people-page__checkbox">
          <input v-model="withoutRoles" type="checkbox" data-test="filter-without-roles"> Без глобальных ролей
        </label>
      </div>
      <p v-if="ministryError" role="alert">
        {{ ministryError }} <button type="button" @click="loadMinistries">Повторить загрузку служений</button>
      </p>
      <div>
        <ul class="people-page__list" aria-label="Список людей" :aria-busy="loading">
          <PersonListItem v-for="person in people" :key="person.id" :person="person" />
        </ul>
        <LoadingState v-if="loading" :label="people.length ? 'Обновляем список людей…' : 'Загружаем людей…'" />
        <p v-else-if="errorMessage" role="alert">
          {{ errorMessage }} <button type="button" data-test="retry" @click="loadPeople(failedPage)">Повторить</button>
        </p>
        <EmptyState v-else-if="!people.length" title="Люди не найдены." :description="emptyDescription" />
        <button
          v-if="currentPage < lastPage && !errorMessage" type="button" data-test="load-more"
          :disabled="loading" @click="loadPeople(currentPage + 1)"
        >Показать ещё</button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.people-page { min-width: 0; width: 100%; max-width: var(--ui-content-width); margin-inline: auto; overflow-wrap: anywhere; }
header { display: flex; align-items: center; flex-wrap: wrap; gap: var(--ui-space-4); justify-content: space-between; margin-bottom: var(--ui-space-6); }
h1 { margin: 0; }

.people-page__filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr)); gap: var(--ui-space-4); background: var(--ui-surface); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); padding: min(var(--ui-space-4), 16px); }
label { min-width: 0; display: flex; flex-direction: column; gap: var(--ui-space-2); }
.people-page__search { grid-column: 1 / -1; }
.people-page__checkbox { flex-direction: row; align-items: center; gap: min(var(--ui-space-2), 8px); }
input, select { width: 100%; max-width: 100%; }
input[type='checkbox'] { flex-shrink: 0; width: min(1.125rem, 24px); height: min(1.125rem, 24px); }
button { max-width: 100%; }
.people-page__list { list-style: none; padding: 0; margin: var(--ui-space-6) 0; border: 1px solid var(--ui-border); border-radius: 14px; overflow: clip; }
.people-page__list:empty { display: none; }
.people-page__notice { padding: min(var(--ui-space-4), 16px); margin-bottom: var(--ui-space-4); background: var(--ui-surface-muted); border-radius: var(--ui-radius-sm); }
</style>
