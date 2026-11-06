<script setup lang="ts">
import MinistryTabs from '~/components/ministries/MinistryTabs.vue'
import PageHeader from '~/components/ui/PageHeader.vue'
import RoleEditor from '~/components/roles/RoleEditor.vue'
import type { Ministry } from '~/utils/ministries'
import type { RoleLike } from '~/utils/roles'
import { apiErrorMessage } from '~/utils/apiError'

const api = useApi()
const auth = useAuthStore()
let active = true
onBeforeUnmount(() => { active = false; requestVersion++ })
const route = useRoute()
const { canIn } = useCan()
const ministryId = computed(() => String(route.params.id))
// Создание, правка, удаление ролей и выбор роли по умолчанию — только
// roles.manage (docs/architecture.md 6.1, 6.3.4). members.manage открывает
// тот же список (доделка задачи 28: чтобы выдать роль участнику, нужно
// сперва увидеть каталог), но не редактирование — сам факт, что GET успешно
// ответил, не даёт права редактировать (см. "Фундамент" брифа задачи 29).
const canManageRoles = computed(() => canIn(ministryId.value, 'roles.manage'))
const canSeeRoles = computed(() => canManageRoles.value || canIn(ministryId.value, 'members.manage'))

const ministry = ref<Ministry | null>(null)
const roles = ref<RoleLike[]>([])
const loading = ref(false)
const errorMessage = ref('')
const selectedId = ref<string | null>(null)
const creating = ref(false)
const editorBusy = ref(false)
const settingDefaultId = ref<string | null>(null)
const defaultRoleError = ref('')
let requestVersion = 0
let defaultVersion = 0

async function load() {
  if (!canSeeRoles.value) return
  const version = ++requestVersion
  loading.value = true
  errorMessage.value = ''
  creating.value = false
  selectedId.value = null
  try {
    const [ministryResponse, rolesResponse] = await Promise.all([
      api.get<{ data: Ministry }>(`/ministries/${encodeURIComponent(ministryId.value)}`),
      api.get<{ data: RoleLike[] }>(`/ministries/${encodeURIComponent(ministryId.value)}/roles`),
    ])
    if (!active || version !== requestVersion) return
    ministry.value = ministryResponse.data
    roles.value = rolesResponse.data
  } catch (error) {
    if (!active || version !== requestVersion) return
    errorMessage.value = apiErrorMessage(error, 'Не удалось загрузить роли служения. Попробуйте ещё раз.')
  } finally {
    if (active && version === requestVersion) loading.value = false
  }
}

const selectedRole = computed(() => roles.value.find(role => role.id === selectedId.value) ?? null)

function selectRole(id: string) {
  if (editorBusy.value) return
  creating.value = false
  selectedId.value = id
}

function startCreating() {
  if (editorBusy.value) return
  if (!canManageRoles.value) return
  selectedId.value = null
  creating.value = true
}

function onCreated(role: RoleLike) {
  roles.value = [...roles.value, role]
  creating.value = false
  selectedId.value = role.id
}

function onUpdated(role: RoleLike) {
  roles.value = roles.value.map(existing => existing.id === role.id ? role : existing)
}

function onDeleted(roleId: string) {
  roles.value = roles.value.filter(role => role.id !== roleId)
  if (selectedId.value === roleId) selectedId.value = null
}

async function setDefaultRole(roleId: string) {
  if (!canManageRoles.value || settingDefaultId.value || ministry.value?.default_role_id === roleId) return
  const version = requestVersion
  const writeVersion = ++defaultVersion
  settingDefaultId.value = roleId
  defaultRoleError.value = ''
  try {
    const response = await api.patch<{ data: Ministry }>(`/ministries/${encodeURIComponent(ministryId.value)}`, {
      default_role_id: roleId,
    })
    if (!active || version !== requestVersion || writeVersion !== defaultVersion || !canManageRoles.value) return
    ministry.value = response.data
  } catch (error) {
    if (!active || version !== requestVersion || writeVersion !== defaultVersion || !canManageRoles.value) return
    defaultRoleError.value = apiErrorMessage(error, 'Не удалось изменить роль по умолчанию. Попробуйте ещё раз.')
  } finally {
    if (active && version === requestVersion && writeVersion === defaultVersion) settingDefaultId.value = null
  }
}

watch([() => auth.sessionVersion, ministryId, canSeeRoles], () => {
  requestVersion++
  editorBusy.value = false
  roles.value = []; ministry.value = null; selectedId.value = null; creating.value = false
  settingDefaultId.value = null; defaultRoleError.value = ''; loading.value = false; errorMessage.value = ''
  if (canSeeRoles.value) void load()
}, { flush: 'sync' })
watch(canManageRoles, (allowed) => {
  defaultVersion++
  if (!allowed) { editorBusy.value = false; selectedId.value = null; creating.value = false; settingDefaultId.value = null; defaultRoleError.value = '' }
}, { flush: 'sync' })
await load()
</script>

<template>
  <section class="roles-tab">
    <MinistryTabs :ministry-id="ministryId" :chat-id="ministry?.chat_id" />
    <PageHeader title="Роли служения" :description="ministry?.name">
      <template v-if="canManageRoles" #actions><button type="button" class="ui-button ui-button--primary" data-test="create-role" :disabled="editorBusy" @click="startCreating">Создать роль</button></template>
    </PageHeader>
    <p v-if="!canSeeRoles" role="alert">Нет права видеть роли этого служения.</p>
    <template v-else>
      <p v-if="loading" role="status">Загрузка…</p>
      <p v-else-if="errorMessage" role="alert">
        {{ errorMessage }} <button type="button" data-test="retry" @click="load">Повторить</button>
      </p>
      <div v-else class="roles-tab__layout">
        <div class="roles-tab__list">
          <h2>Роли и роль по умолчанию</h2>
          <p class="ui-hint">Роль по умолчанию выдаётся при добавлении участника.</p>
          <ul>
            <li v-for="role in roles" :key="role.id" class="roles-tab__row">
              <button v-if="canManageRoles" type="button" :aria-pressed="selectedId === role.id && !creating" :disabled="editorBusy" :data-test="`select-role-${role.id}`" @click="selectRole(role.id)">
                {{ role.name }}<span v-if="role.is_system"> (системная)</span>
              </button>
              <span v-else>{{ role.name }}<template v-if="role.is_system"> (системная)</template></span>
              <span v-if="ministry?.default_role_id === role.id" class="roles-tab__badge">по умолчанию</span>
              <button
                v-else-if="canManageRoles" type="button" :data-test="`set-default-${role.id}`"
                :disabled="!!settingDefaultId" @click="setDefaultRole(role.id)"
              >Сделать ролью по умолчанию</button>
            </li>
          </ul>
          <p v-if="defaultRoleError" role="alert">{{ defaultRoleError }}</p>
        </div>
        <RoleEditor
          v-if="canManageRoles && (creating || selectedRole)" :key="`${auth.sessionVersion}-${ministryId}-${selectedRole?.id ?? 'new'}`"
          scope="ministry" :ministry-id="ministryId" :role="selectedRole"
          @busy="editorBusy = $event" @created="onCreated" @updated="onUpdated" @deleted="onDeleted"
        />
        <p v-else-if="canManageRoles" class="ui-hint">Выберите роль из списка или создайте новую.</p>
      </div>
    </template>
  </section>
</template>

<style scoped>
button { max-width: 100%; overflow-wrap: anywhere; }
.primary { background: var(--ui-accent); color: var(--ui-on-accent); border-color: var(--ui-accent); }
button[aria-pressed='true'] { background: var(--ui-accent-soft); border-color: var(--ui-accent); color: var(--ui-accent); }

.roles-tab { min-width: 0; color: var(--ui-text); overflow-wrap: anywhere; }
h1 { margin: 0 0 1rem; }
/* Телефон: список ролей и редактор друг под другом; с 1024px — рядом.
   minmax(0, …) даёт колонке сжиматься уже содержимого, иначе редактор
   выталкивал страницу за край экрана. */
.roles-tab__layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1.5rem; align-items: start; }
@media (min-width: 1024px) {
  .roles-tab__layout { grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); gap: var(--ui-space-6); }
}
.roles-tab__list { padding: var(--ui-space-4); background: var(--ui-surface); border: 1px solid var(--ui-border); border-radius: 14px; min-width: 0; }
.roles-tab__list h2 { margin: 0; }
.roles-tab__list ul { list-style: none; padding: 0; margin: 0.75rem 0 0; }
.roles-tab__row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin: 0.3rem 0; }
/* Основа 12rem: на узком экране кнопка «Сделать ролью по умолчанию»
   переносится на свою строку, а не сжимает название роли по буквам. */
.roles-tab__row button:first-child { flex: 1 1 12rem; text-align: left; }
.roles-tab__badge { padding: 0 0.5rem; border-radius: 1rem; background: var(--ui-surface-muted); font-size: 0.875rem; max-width: 100%; overflow-wrap: anywhere; }
input, textarea, button { font: inherit; padding: .625rem min(.875rem, 14px); border: 1px solid var(--ui-border-strong); border-radius: var(--ui-radius-sm); min-width: 0; }
button { cursor: pointer; }
button:disabled { opacity: 0.6; cursor: wait; }
[role='alert'] { color: var(--ui-danger); }
</style>
