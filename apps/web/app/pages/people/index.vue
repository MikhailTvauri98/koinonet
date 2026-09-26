<script setup lang="ts">
import type { components } from '~~/types/api'
import PersonForm from '~/components/people/PersonForm.vue'
import PersonListItem from '~/components/people/PersonListItem.vue'
import { personStatuses, type Person, type PersonStatus, type PeopleResponse, type PersonCreatedResponse } from '~/utils/people'
import { apiErrorMessage } from '~/utils/apiError'

const api = useApi()
const { can } = useCan()
const canView = computed(() => can('people.view'))
const canManage = computed(() => can('people.manage'))
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
const created = ref<PersonCreatedResponse | null>(null)
let requestVersion = 0
let ministryVersion = 0
let failedPage = 1
let searchTimer: ReturnType<typeof setTimeout> | undefined

async function loadPeople(page = 1) {
  if (!canView.value) return
  const version = ++requestVersion
  loading.value = true
  errorMessage.value = ''
  if (page === 1) {
    people.value = []
    currentPage.value = 0
    lastPage.value = 0
  }
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
  clearTimeout(searchTimer)
  void loadPeople()
}

watch(search, () => {
  clearTimeout(searchTimer)
  // Старая выдача и запоздавший ответ больше не соответствуют введённому поиску.
  requestVersion++
  people.value = []
  currentPage.value = 0
  lastPage.value = 0
  errorMessage.value = ''
  loading.value = true
  searchTimer = setTimeout(() => { void loadPeople() }, 300)
})
watch([status, ministry, archived, withoutRoles], resetList)
watch(canManage, (allowed) => { if (!allowed) showForm.value = false })
watch(canView, (allowed) => {
  clearTimeout(searchTimer)
  requestVersion++
  ministryVersion++
  people.value = []
  ministries.value = []
  created.value = null
  showForm.value = false
  loading.value = false
  if (allowed) {
    void loadPeople()
    void loadMinistries()
  }
})
onBeforeUnmount(() => {
  clearTimeout(searchTimer)
  requestVersion++
  ministryVersion++
})

function onCreated(response: PersonCreatedResponse) {
  if (!canView.value) return
  created.value = response
  showForm.value = false
  resetList()
}

if (canView.value) await Promise.all([loadPeople(), loadMinistries()])
</script>

<template>
  <section class="people-page">
    <header>
      <h1>Люди</h1>
      <button
        v-if="canView && canManage && !showForm" type="button" data-test="create-person"
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
      <PersonForm v-if="showForm && canManage" @created="onCreated" @cancel="showForm = false" />
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
      <div :aria-busy="loading">
        <ul class="people-page__list" aria-label="Список людей">
          <PersonListItem v-for="person in people" :key="person.id" :person="person" />
        </ul>
        <p v-if="loading" role="status">Загрузка…</p>
        <p v-else-if="errorMessage" role="alert">
          {{ errorMessage }} <button type="button" data-test="retry" @click="loadPeople(failedPage)">Повторить</button>
        </p>
        <p v-else-if="!people.length" role="status">Люди не найдены. Попробуйте изменить поиск или фильтры.</p>
        <button
          v-if="currentPage < lastPage && !errorMessage" type="button" data-test="load-more"
          :disabled="loading" @click="loadPeople(currentPage + 1)"
        >Показать ещё</button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.people-page { max-width: 64rem; margin: 0 auto; color: #202b3a; }
header { display: flex; align-items: center; flex-wrap: wrap; gap: 0.75rem; justify-content: space-between; margin-bottom: 1rem; }
h1 { margin: 0; }
.people-page__filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr)); gap: 1rem; }
label { display: flex; flex-direction: column; gap: 0.4rem; }
.people-page__search { grid-column: 1 / -1; }
.people-page__checkbox { flex-direction: row; align-items: center; }
input, select, button { font: inherit; padding: 0.65rem; border: 1px solid #8b96a6; border-radius: 0.3rem; min-width: 0; }
input[type='checkbox'] { width: 1.1rem; height: 1.1rem; }
button { cursor: pointer; background: #f3f5f8; color: #202b3a; }
header button { background: #234e79; color: white; }
button:disabled { opacity: 0.6; cursor: wait; }
.people-page__list { list-style: none; padding: 0; margin: 1rem 0; }
.people-page__notice { padding: 0.75rem 1rem; margin-bottom: 1rem; background: #edf5ee; border-radius: 0.4rem; }
[role='alert'] { color: #a32020; }
</style>
