<script setup lang="ts">
import PersonForm from '~/components/people/PersonForm.vue'
import PersonContacts from '~/components/people/PersonContacts.vue'
import PersonRoles from '~/components/people/PersonRoles.vue'
import PersonAccountActions from '~/components/people/PersonAccountActions.vue'
import { personStatuses, peopleErrorMessage, type PeopleError, type Person, type PersonStatus } from '~/utils/people'

const api = useApi()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { can } = useCan()
const person = ref<Person | null>(null)
const editing = ref(false)
const confirmArchive = ref(false)
const busy = ref(false)
const loading = ref(false)
const errorMessage = ref('')
const actionError = ref('')
const notice = ref('')
const personId = computed(() => String(route.params.id))
const canView = computed(() => can('people.view') || auth.person?.id === personId.value)
let requestVersion = 0
let active = true

async function load() {
  const version = ++requestVersion
  person.value = null
  editing.value = false
  confirmArchive.value = false
  actionError.value = ''
  errorMessage.value = ''
  if (!canView.value) {
    loading.value = false
    errorMessage.value = 'Нет права на просмотр карточки.'
    return
  }
  loading.value = true
  try {
    const response = await api.get<{ data: Person }>(`/people/${encodeURIComponent(personId.value)}`)
    if (version === requestVersion && active) person.value = response.data
  } catch (error) {
    if (version !== requestVersion || !active) return
    const failure = error as PeopleError | undefined
    errorMessage.value = failure?.statusCode === 404 || failure?.status === 404
      ? 'Человек не найден.' : peopleErrorMessage(error, 'Не удалось загрузить карточку. Попробуйте ещё раз.')
  } finally {
    if (version === requestVersion) loading.value = false
  }
}

async function changed() {
  notice.value = 'Изменения сохранены.'
  if (auth.person?.id === personId.value) {
    await auth.fetchMe()
    if (!auth.user) {
      person.value = null
      await router.push('/login')
      return
    }
  }
  await load()
}

async function archive(restore = false) {
  if (busy.value || !can('people.manage')) return
  busy.value = true
  actionError.value = ''
  const id = personId.value
  try {
    await api.post(`/people/${encodeURIComponent(id)}/${restore ? 'restore' : 'archive'}`)
    if (active && id === personId.value) await changed()
  } catch (error) {
    if (active && id === personId.value) actionError.value = peopleErrorMessage(error, 'Не удалось выполнить действие. Попробуйте ещё раз.')
  } finally {
    busy.value = false
  }
}

// Изменения прав требуют перечитать серверную видимость контактов и заметки.
// Сравнение содержимого избегает повторных загрузок при неизменном /auth/me.
watch([personId, () => JSON.stringify(auth.permissions)], () => { notice.value = ''; void load() })
onBeforeUnmount(() => { active = false; requestVersion++ })
await load()
</script>

<template>
  <section class="person-card">
    <NuxtLink to="/people">К списку людей</NuxtLink>
    <p v-if="loading" role="status">Загрузка…</p>
    <p v-else-if="errorMessage" role="alert">
      {{ errorMessage }} <button v-if="canView" type="button" data-test="retry-card" @click="load">Повторить</button>
    </p>
    <template v-if="person">
      <header>
        <img v-if="person.photo_url" :src="person.photo_url" :alt="`Фото: ${person.full_name}`" width="96" height="96" data-test="person-photo">
        <div><h1>{{ person.full_name }}</h1><p>{{ personStatuses[person.status as PersonStatus] ?? person.status }}</p></div>
      </header>
      <p v-if="person.archived" class="notice">В архиве</p>
      <p v-if="notice" role="status">{{ notice }}</p>
      <PersonForm v-if="editing && can('people.manage')" :person="person" @updated="changed" @cancel="editing = false" />
      <template v-else>
        <button v-if="can('people.manage')" type="button" data-test="edit-person" @click="editing = true">Редактировать</button>
        <PersonContacts v-if="person.contacts" :contacts="person.contacts" />
        <section v-if="person.note !== undefined" data-test="note"><h2>Заметка</h2><p class="note">{{ person.note || 'Заметка не заполнена.' }}</p></section>
      </template>
      <section>
        <h2>Служения</h2>
        <ul v-if="person.ministries?.length"><li v-for="ministry in person.ministries" :key="ministry.id">{{ ministry.name }}</li></ul>
        <p v-else>Нет доступных для просмотра служений.</p>
      </section>
      <PersonRoles :person="person" @changed="changed" />
      <PersonAccountActions :person="person" @changed="changed" />
      <section v-if="can('people.manage')">
        <h2>Архивация</h2>
        <button v-if="person.archived" type="button" data-test="restore" :disabled="busy" @click="archive(true)">Вернуть из архива</button>
        <button v-else type="button" data-test="archive" :disabled="busy" @click="confirmArchive = true">Архивировать</button>
        <div v-if="confirmArchive" role="group" aria-label="Подтверждение архивации" class="notice">
          <p>Архивировать человека? Запись будет скрыта из активного списка, история сохранится.</p>
          <button type="button" data-test="confirm-action" :disabled="busy" @click="archive()">Подтвердить архивацию</button>
          <button type="button" data-test="cancel-action" :disabled="busy" @click="confirmArchive = false">Отмена</button>
        </div>
        <p v-if="actionError" role="alert">{{ actionError }}</p>
      </section>
    </template>
  </section>
</template>

<style scoped>
.person-card { max-width: 56rem; margin: 0 auto; color: #202b3a; overflow-wrap: anywhere; }
header { display: flex; align-items: center; gap: 1rem; margin: 1.5rem 0; }
header img { border-radius: 50%; object-fit: cover; }
h1 { margin: 0; }
.person-card > section { border-top: 1px solid #d8dce2; margin-top: 1.5rem; }
button { font: inherit; padding: 0.65rem; margin-right: 0.5rem; cursor: pointer; }
button:disabled { opacity: 0.6; cursor: default; }
.notice { background: #edf1f6; padding: 1rem; border-radius: 0.5rem; margin-top: 1rem; }
.note { white-space: pre-wrap; }
[role='alert'] { color: #a32020; }
</style>
