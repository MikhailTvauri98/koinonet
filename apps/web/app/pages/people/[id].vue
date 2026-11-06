<script setup lang="ts">
import PersonForm from '~/components/people/PersonForm.vue'
import PersonContacts from '~/components/people/PersonContacts.vue'
import PersonRoles from '~/components/people/PersonRoles.vue'
import PersonAccountActions from '~/components/people/PersonAccountActions.vue'
import { personStatuses, type Person, type PersonStatus } from '~/utils/people'
import { isDirectChatTarget, useDirectChatNavigation } from '~/composables/useStartDirectChat'
import { apiErrorMessage } from '~/utils/apiError'

const api = useApi()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { can } = useCan()
const person = ref<Person | null>(null)
const heading = ref<HTMLHeadingElement>()
const editButton = ref<HTMLButtonElement>()
const editing = ref(false)
const confirmArchive = ref(false)
const busy = ref(false)
const accountPending = ref(false)
const rolesPending = ref(false)
const actionsLocked = computed(() => busy.value || accountPending.value || rolesPending.value || direct.pending.value)
const loading = ref(false)
const errorMessage = ref('')
const actionError = ref('')
const notice = ref('')
const refreshError = ref('')
const personId = computed(() => String(route.params.id))
const canView = computed(() => can('people.view') || auth.person?.id === personId.value)
const direct = useDirectChatNavigation(() => personId.value)
const canWrite = computed(() => can('people.view') && can('chats.dm') && person.value?.id === personId.value && isDirectChatTarget(person.value, auth.user?.id))
// Only capabilities that change the server's visible person projection trigger a read.
const visibility = computed(() => JSON.stringify([
  canView.value, can('people.view_contacts'), can('people.view_notes'), can('ministries.view_all'), can('ministries.manage_all'),
  Object.entries(auth.permissions.ministries).map(([id, keys]) => [id, keys.includes('members.view_contacts')]).sort(([a], [b]) => String(a).localeCompare(String(b))),
]))
let requestVersion = 0
let contextVersion = 0
let archiveVersion = 0
let active = true

async function load() {
  const version = ++requestVersion
  person.value = null
  editing.value = false
  confirmArchive.value = false
  errorMessage.value = ''
  if (!canView.value) {
    loading.value = false
    errorMessage.value = 'Нет права на просмотр карточки.'
    return
  }
  const id = personId.value
  loading.value = true
  try {
    const response = await api.get<{ data: Person }>(`/people/${encodeURIComponent(id)}`)
    if (version === requestVersion && active && canView.value) person.value = response.data
  } catch (error) {
    if (version !== requestVersion || !active) return
    errorMessage.value = apiErrorMessage(error, 'Не удалось загрузить карточку. Попробуйте ещё раз.')
  } finally {
    if (version === requestVersion && active) loading.value = false
  }
}
async function focusHeading() { await nextTick(); heading.value?.focus() }
async function beginEdit() { if (!actionsLocked.value) editing.value = true }
async function cancelEdit() { editing.value = false; await nextTick(); editButton.value?.focus() }

async function refresh() {
  const context = contextVersion
  const id = personId.value
  refreshError.value = ''
  if (auth.person?.id === id) {
    const session = auth.sessionVersion
    await auth.fetchMe()
    if (!active || personId.value !== id) return
    if (!auth.user && auth.sessionVersion !== session) { await router.push('/login'); return }
    if (context !== contextVersion) return
    if (auth.connectionLost) {
      refreshError.value = 'Изменения сохранены. Не удалось обновить данные аккаунта.'
      return
    }
  }
  if (!active || context !== contextVersion) return
  await load()
  if (active && context === contextVersion) await focusHeading()
}
async function changed() {
  notice.value = 'Изменения сохранены.'
  editing.value = false
  await refresh()
}
async function archive(restore = false) {
  if (actionsLocked.value || !can('people.manage')) return
  busy.value = true
  actionError.value = ''
  const version = ++archiveVersion
  const context = contextVersion
  const id = personId.value
  const current = () => active && version === archiveVersion && context === contextVersion && can('people.manage')
  try {
    await api.post(`/people/${encodeURIComponent(id)}/${restore ? 'restore' : 'archive'}`)
    if (current()) await changed()
  } catch (error) {
    if (current()) actionError.value = apiErrorMessage(error, 'Не удалось выполнить действие. Попробуйте ещё раз.')
  } finally {
    if (current()) busy.value = false
  }
}
async function write() {
  if (!actionsLocked.value && canWrite.value && person.value?.user_id) await direct.open(person.value.user_id)
}

watch([personId, () => auth.sessionVersion, () => auth.user?.id], () => {
  contextVersion++; archiveVersion++
  busy.value = false; actionError.value = ''; notice.value = ''; refreshError.value = ''
  void load()
}, { flush: 'sync' })
watch(visibility, () => { void load() }, { flush: 'sync' })
watch(() => can('people.manage'), () => {
  archiveVersion++; busy.value = false; confirmArchive.value = false; actionError.value = ''
  if (!can('people.manage')) editing.value = false
}, { flush: 'sync' })
onBeforeUnmount(() => { active = false; requestVersion++; contextVersion++; archiveVersion++ })
await load()
</script>

<template>
  <section class="person-card">
    <NuxtLink class="person-card__back" to="/people">‹ К списку людей</NuxtLink>
    <p v-if="notice" role="status" class="person-card__notice" data-test="person-saved">{{ notice }}</p>
    <p v-if="refreshError" role="alert">{{ refreshError }} <button type="button" class="ui-button" data-test="retry-person-refresh" @click="refresh">Обновить данные</button></p>
    <p v-if="loading" role="status">Загрузка…</p>
    <p v-else-if="errorMessage" role="alert">
      {{ errorMessage }} <button v-if="canView" type="button" class="ui-button" data-test="retry-card" @click="load">Повторить</button>
    </p>
    <template v-if="person">
      <header class="person-card__header">
        <img v-if="person.photo_url" :src="person.photo_url" :alt="`Фото: ${person.full_name}`" width="72" height="72" data-test="person-photo">
        <span v-else class="person-card__placeholder" aria-hidden="true">{{ person.full_name.slice(0, 1) }}</span>
        <div class="person-card__identity">
          <h1 ref="heading" tabindex="-1">{{ person.full_name }}</h1>
          <p>{{ personStatuses[person.status as PersonStatus] ?? person.status }}<span v-if="person.archived"> · В архиве</span></p>
        </div>
        <div v-if="!editing" class="person-card__actions">
          <button v-if="canWrite" type="button" class="ui-button ui-button--primary" data-test="write" :disabled="actionsLocked" @click="write">{{ direct.confirmedId.value ? 'Открыть чат' : direct.pending.value ? 'Открываем чат…' : 'Написать' }}</button>
          <button v-if="can('people.manage')" ref="editButton" type="button" class="ui-button" data-test="edit-person" :disabled="person.archived || actionsLocked" :title="person.archived ? 'Сначала верните человека из архива.' : ''" @click="beginEdit">Редактировать</button>
        </div>
      </header>
      <p v-if="direct.error.value" role="alert">{{ direct.error.value }}</p>
      <PersonForm v-if="editing && can('people.manage')" :key="person.id" :person="person" @updated="changed" @cancel="cancelEdit" />
      <div v-else class="person-card__sections">
        <PersonContacts v-if="person.contacts" :contacts="person.contacts" />
        <section v-if="person.note !== undefined" class="person-card__section" data-test="note"><h2>Заметка</h2><p class="person-card__note">{{ person.note || 'Заметка не заполнена.' }}</p></section>
        <section class="person-card__section">
          <h2>Служения</h2>
          <ul v-if="person.ministries?.length" class="person-card__tags"><li v-for="ministry in person.ministries" :key="ministry.id">{{ ministry.name }}</li></ul>
          <p v-else class="person-card__muted">Нет доступных для просмотра служений.</p>
        </section>
        <PersonRoles :person="person" :disabled="busy || accountPending || direct.pending.value" @busy="rolesPending = $event" @changed="changed" />
        <PersonAccountActions :person="person" :disabled="busy || rolesPending || direct.pending.value" @busy="accountPending = $event" @changed="changed" />
      </div>
      <details v-if="can('people.manage') && !editing" class="person-card__management">
        <summary>Архивация</summary>
        <p class="person-card__muted">Архивация скрывает запись из активного списка и сохраняет историю.</p>
        <button v-if="person.archived" type="button" class="ui-button" data-test="restore" :disabled="actionsLocked" @click="archive(true)">Вернуть из архива</button>
        <button v-else type="button" class="ui-button ui-button--danger" data-test="archive" :disabled="actionsLocked" @click="confirmArchive = true">Архивировать</button>
        <div v-if="confirmArchive" role="group" aria-label="Подтверждение архивации" class="person-card__notice">
          <p>Архивировать человека? Запись будет скрыта из активного списка, история сохранится.</p>
          <div class="person-card__actions">
            <button type="button" class="ui-button ui-button--danger" data-test="confirm-action" :disabled="actionsLocked" @click="archive()">Подтвердить архивацию</button>
            <button type="button" class="ui-button" data-test="cancel-action" :disabled="actionsLocked" @click="confirmArchive = false">Отмена</button>
          </div>
        </div>
      </details>
      <p v-if="actionError" role="alert">{{ actionError }}</p>
    </template>
  </section>
</template>

<style scoped>
.person-card { width: 100%; min-width: 0; overflow-wrap: anywhere; }
.person-card__back { display: inline-flex; align-items: center; min-height: 44px; }
.person-card__header { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ui-space-4); margin-block: var(--ui-space-4) var(--ui-space-6); }
.person-card__identity { min-width: 0; flex: 1 1 16rem; }
.person-card__identity h1 { margin: 0; }
.person-card__identity p { margin: var(--ui-space-2) 0 0; color: var(--ui-text-muted); }
.person-card__header img, .person-card__placeholder { width: 72px; height: 72px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
.person-card__placeholder { display: grid; place-items: center; color: var(--ui-accent); background: var(--ui-accent-soft); font-size: 1.5rem; }
.person-card__sections { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--ui-space-4); align-items: start; container-type: inline-size; }
.person-card__sections > *, .person-card__section { min-width: 0; }
.person-card__section { background: var(--ui-surface); padding: min(var(--ui-space-6), 24px); border: 1px solid var(--ui-border); border-radius: 14px; }
.person-card__section h2 { margin: 0 0 var(--ui-space-4); font-size: 1.25rem; }
.person-card__note { white-space: pre-wrap; }
.person-card__note, .person-card__section p { margin: 0; }
.person-card__muted { color: var(--ui-text-muted); }
.person-card__actions { display: flex; flex-wrap: wrap; gap: var(--ui-space-2); }
.person-card__tags { display: flex; flex-wrap: wrap; gap: var(--ui-space-2); padding: 0; margin: 0; list-style: none; }
.person-card__tags li { padding: var(--ui-space-2) var(--ui-space-3); border-radius: 8px; background: var(--ui-surface-muted); }
.person-card__notice { margin-block: var(--ui-space-4); padding: var(--ui-space-4); background: var(--ui-surface-muted); border: 1px solid var(--ui-border); border-radius: 10px; }
.person-card__management { margin-top: var(--ui-space-6); border-top: 1px solid var(--ui-border); padding-top: var(--ui-space-3); }
.person-card__management summary { min-height: 44px; align-content: center; cursor: pointer; font-weight: 600; }
[role='alert'] { color: var(--ui-danger); }
@media (min-width: 1000px) { .person-card__sections { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 479px) { .person-card__identity { flex-basis: calc(100% - 100px); } .person-card__actions { width: 100%; } .person-card__section { padding: 16px; } }
</style>
