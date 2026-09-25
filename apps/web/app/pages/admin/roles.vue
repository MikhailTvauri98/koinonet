<script setup lang="ts">
import RoleEditor from '~/components/roles/RoleEditor.vue'
import { rolesErrorMessage, type RoleLike } from '~/utils/roles'

const api = useApi()
const { can } = useCan()
const canManage = computed(() => can('roles.manage_global'))
const roles = ref<RoleLike[]>([])
const loading = ref(false)
const errorMessage = ref('')
const selectedId = ref<string | null>(null)
const creating = ref(false)
let requestVersion = 0

async function load() {
  if (!canManage.value) return
  const version = ++requestVersion
  loading.value = true
  errorMessage.value = ''
  try {
    const response = await api.get<{ data: RoleLike[] }>('/roles?scope=global')
    if (version === requestVersion) roles.value = response.data
  } catch (error) {
    if (version === requestVersion) errorMessage.value = rolesErrorMessage(error, 'Не удалось загрузить роли. Попробуйте ещё раз.')
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

// Право снимается посреди сессии тем же приёмом, что и в других списках
// модуля (people/index.vue, ministries/[id]/members.vue): canManage читается
// заново при каждом пересчёте (useCan.ts), watch реагирует на его смену.
watch(canManage, (allowed) => {
  if (allowed) {
    void load()
  } else {
    roles.value = []
    selectedId.value = null
    creating.value = false
  }
})

if (canManage.value) await load()
</script>

<template>
  <section class="admin-roles">
    <nav aria-label="Разделы администрирования" class="admin-roles__tabs">
      <NuxtLink to="/admin/roles" class="admin-roles__tabs-active">Роли</NuxtLink>
    </nav>
    <h1>Глобальные роли</h1>
    <p v-if="!canManage" role="alert">Нет права на управление глобальными ролями.</p>
    <template v-else>
      <p v-if="loading" role="status">Загрузка…</p>
      <p v-else-if="errorMessage" role="alert">
        {{ errorMessage }} <button type="button" data-test="retry" @click="load">Повторить</button>
      </p>
      <div v-else class="admin-roles__layout">
        <div class="admin-roles__list">
          <button type="button" data-test="create-role" @click="startCreating">Создать роль</button>
          <ul>
            <li v-for="role in roles" :key="role.id">
              <button type="button" :data-test="`select-role-${role.id}`" @click="selectRole(role.id)">
                {{ role.name }}<span v-if="role.is_system"> (системная)</span>
              </button>
            </li>
          </ul>
        </div>
        <RoleEditor
          v-if="creating || selectedRole" :key="selectedRole?.id ?? 'new'"
          scope="global" :role="selectedRole"
          @created="onCreated" @updated="onUpdated" @deleted="onDeleted"
        />
      </div>
    </template>
  </section>
</template>

<style scoped>
.admin-roles { max-width: 64rem; margin: 0 auto; color: #202b3a; }
.admin-roles__tabs { display: flex; gap: 1rem; margin-bottom: 1rem; }
.admin-roles__tabs-active { font-weight: 600; }
h1 { margin: 0 0 1rem; }
.admin-roles__layout { display: grid; grid-template-columns: minmax(12rem, 16rem) 1fr; gap: 2rem; align-items: start; }
.admin-roles__list ul { list-style: none; padding: 0; margin: 0.75rem 0 0; }
.admin-roles__list button { display: block; width: 100%; text-align: left; margin: 0.3rem 0; }
input, textarea, button { font: inherit; padding: 0.65rem; border: 1px solid #8b96a6; border-radius: 0.3rem; }
button { cursor: pointer; }
button:disabled { opacity: 0.6; cursor: wait; }
[role='alert'] { color: #a32020; }
</style>
