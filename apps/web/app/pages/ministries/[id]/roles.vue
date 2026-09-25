<script setup lang="ts">
import RoleEditor from '~/components/roles/RoleEditor.vue'
import { ministriesErrorMessage, type Ministry } from '~/utils/ministries'
import { rolesErrorMessage, type RoleLike } from '~/utils/roles'

const api = useApi()
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
const settingDefaultId = ref<string | null>(null)
const defaultRoleError = ref('')
let requestVersion = 0

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
    if (version !== requestVersion) return
    ministry.value = ministryResponse.data
    roles.value = rolesResponse.data
  } catch (error) {
    if (version !== requestVersion) return
    errorMessage.value = ministriesErrorMessage(error, 'Не удалось загрузить роли служения. Попробуйте ещё раз.')
  } finally {
    if (version === requestVersion) loading.value = false
  }
}

const selectedRole = computed(() => roles.value.find(role => role.id === selectedId.value) ?? null)

function selectRole(id: string) {
  creating.value = false
  selectedId.value = id
}

function startCreating() {
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
  settingDefaultId.value = roleId
  defaultRoleError.value = ''
  try {
    const response = await api.patch<{ data: Ministry }>(`/ministries/${encodeURIComponent(ministryId.value)}`, {
      default_role_id: roleId,
    })
    ministry.value = response.data
  } catch (error) {
    defaultRoleError.value = rolesErrorMessage(error, 'Не удалось изменить роль по умолчанию. Попробуйте ещё раз.')
  } finally {
    settingDefaultId.value = null
  }
}

watch(canSeeRoles, (allowed) => {
  if (allowed) {
    void load()
  } else {
    roles.value = []
    ministry.value = null
    selectedId.value = null
    creating.value = false
  }
})
// Nuxt переиспользует компонент страницы между служениями (тот же приём,
// что в members.vue) — иначе роли и выбранная роль старого служения
// остались бы видны под новым route.params.id.
watch(() => route.params.id, () => { void load() })
await load()
</script>

<template>
  <section class="roles-tab">
    <nav aria-label="Разделы служения" class="roles-tab__tabs">
      <NuxtLink :to="`/ministries/${ministryId}`">Обзор</NuxtLink>
      <NuxtLink :to="`/ministries/${ministryId}/members`">Участники</NuxtLink>
      <NuxtLink :to="`/ministries/${ministryId}/roles`" class="roles-tab__tabs-active">Роли</NuxtLink>
    </nav>
    <h1>Роли служения</h1>
    <p v-if="!canSeeRoles" role="alert">Нет права видеть роли этого служения.</p>
    <template v-else>
      <p v-if="loading" role="status">Загрузка…</p>
      <p v-else-if="errorMessage" role="alert">
        {{ errorMessage }} <button type="button" data-test="retry" @click="load">Повторить</button>
      </p>
      <div v-else class="roles-tab__layout">
        <div class="roles-tab__list">
          <button v-if="canManageRoles" type="button" data-test="create-role" @click="startCreating">Создать роль</button>
          <ul>
            <li v-for="role in roles" :key="role.id" class="roles-tab__row">
              <button v-if="canManageRoles" type="button" :data-test="`select-role-${role.id}`" @click="selectRole(role.id)">
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
          v-if="canManageRoles && (creating || selectedRole)" :key="selectedRole?.id ?? 'new'"
          scope="ministry" :ministry-id="ministryId" :role="selectedRole"
          @created="onCreated" @updated="onUpdated" @deleted="onDeleted"
        />
      </div>
    </template>
  </section>
</template>

<style scoped>
.roles-tab { max-width: 64rem; margin: 0 auto; color: #202b3a; }
.roles-tab__tabs { display: flex; gap: 1rem; margin-bottom: 1rem; }
.roles-tab__tabs-active { font-weight: 600; }
h1 { margin: 0 0 1rem; }
.roles-tab__layout { display: grid; grid-template-columns: minmax(14rem, 18rem) 1fr; gap: 2rem; align-items: start; }
.roles-tab__list ul { list-style: none; padding: 0; margin: 0.75rem 0 0; }
.roles-tab__row { display: flex; align-items: center; gap: 0.5rem; margin: 0.3rem 0; }
.roles-tab__row button:first-child { flex: 1; text-align: left; }
.roles-tab__badge { padding: 0 0.5rem; border-radius: 1rem; background: #edf1f6; font-size: 0.875rem; white-space: nowrap; }
input, textarea, button { font: inherit; padding: 0.65rem; border: 1px solid #8b96a6; border-radius: 0.3rem; }
button { cursor: pointer; }
button:disabled { opacity: 0.6; cursor: wait; }
[role='alert'] { color: #a32020; }
</style>
