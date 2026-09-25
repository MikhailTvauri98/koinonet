<script setup lang="ts">
import PermissionGroup from '~/components/roles/PermissionGroup.vue'
import RoleUsageDialog from '~/components/roles/RoleUsageDialog.vue'
import {
  PERMISSION_GROUP_LABELS, permissionGroupPrefix, rolesErrorMessage,
  type PermissionCatalogueEntry, type RoleLike,
} from '~/utils/roles'

// Один компонент на оба уровня (глобальные роли и роли служения, критерий
// готовности задачи 29): область различает только каталог прав, показанный
// в форме, и то, какой эндпоинт создаёт новую роль. Права на клиенте здесь
// сознательно не проверяются через useCan/canIn — решение, показывать ли
// вообще этот компонент (а не read-only список), принимают вызывающие
// страницы (admin/roles.vue, ministries/[id]/roles.vue) по `roles.manage[_global]`,
// а не сам факт того, что каталог или роль успешно загрузились
// ("Фундамент" брифа задачи 29).
const props = defineProps<{
  scope: 'global' | 'ministry'
  ministryId?: string
  role: RoleLike | null
}>()
const emit = defineEmits<{
  created: [role: RoleLike]
  updated: [role: RoleLike]
  deleted: [roleId: string]
}>()

const api = useApi()
const catalogue = ref<PermissionCatalogueEntry[]>([])
const loadErrorMessage = ref('')
const name = ref('')
const description = ref('')
const selectedPermissions = ref<string[]>([])
const saving = ref(false)
const saveError = ref('')
const showDeleteDialog = ref(false)

const isSystem = computed(() => props.role?.is_system === true)

// Инвариант 6.3.1: роль «Администратор» не редактируется в интерфейсе, а не
// только на сервере — is_system приходит с сервера как флаг, имя роли в
// проверке не участвует (правило репозитория: "Администратор" в условиях
// кода не встречается).
function resetForm() {
  name.value = props.role?.name ?? ''
  description.value = props.role?.description ?? ''
  selectedPermissions.value = [...(props.role?.permissions ?? [])]
  saveError.value = ''
  showDeleteDialog.value = false
}

async function loadCatalogue() {
  loadErrorMessage.value = ''
  try {
    catalogue.value = (await api.get<{ data: PermissionCatalogueEntry[] }>('/permissions')).data
  } catch (error) {
    loadErrorMessage.value = rolesErrorMessage(error, 'Не удалось загрузить каталог прав. Попробуйте ещё раз.')
  }
}

const scopedCatalogue = computed(() => catalogue.value.filter(permission => permission.scope === props.scope))

const groups = computed(() => {
  const byPrefix = new Map<string, PermissionCatalogueEntry[]>()
  for (const permission of scopedCatalogue.value) {
    const prefix = permissionGroupPrefix(permission.key)
    const list = byPrefix.get(prefix)
    if (list) list.push(permission)
    else byPrefix.set(prefix, [permission])
  }
  return [...byPrefix.entries()].map(([prefix, items]) => ({
    prefix,
    title: PERMISSION_GROUP_LABELS[prefix] ?? prefix,
    items,
  }))
})

// Риск 9 (раздел 15): роль служения без единого права смущает админов в
// списке — здесь это то же самое состояние формы, живое, а не только на
// уже сохранённой роли, так что подсказка видна и в момент создания, ещё до
// первого сохранения.
const showSlotPositionNotice = computed(() => props.scope === 'ministry' && selectedPermissions.value.length === 0)

watch(() => props.role, resetForm)
resetForm()
await loadCatalogue()

async function save() {
  if (saving.value || isSystem.value) return
  if (!name.value.trim()) {
    saveError.value = 'Заполните название.'
    return
  }
  saving.value = true
  saveError.value = ''
  try {
    if (props.role) {
      const response = await api.patch<{ data: RoleLike }>(`/roles/${encodeURIComponent(props.role.id)}`, {
        name: name.value.trim(),
        description: description.value.trim() || null,
        permissions: [...selectedPermissions.value],
      })
      emit('updated', response.data)
    } else if (props.scope === 'global') {
      const response = await api.post<{ data: RoleLike }>('/roles', {
        scope: 'global',
        name: name.value.trim(),
        description: description.value.trim() || null,
        permissions: [...selectedPermissions.value],
      })
      emit('created', response.data)
    } else {
      if (!props.ministryId) return
      const response = await api.post<{ data: RoleLike }>(`/ministries/${encodeURIComponent(props.ministryId)}/roles`, {
        name: name.value.trim(),
        description: description.value.trim() || null,
        permissions: [...selectedPermissions.value],
      })
      emit('created', response.data)
    }
  } catch (error) {
    saveError.value = rolesErrorMessage(error, 'Не удалось сохранить роль. Попробуйте ещё раз.')
  } finally {
    saving.value = false
  }
}

function onDeleted(roleId: string) {
  showDeleteDialog.value = false
  emit('deleted', roleId)
}
</script>

<template>
  <div class="role-editor">
    <p v-if="isSystem" class="role-editor__notice">
      Это системная роль: даёт все права церкви, имя и права не редактируются, удалить нельзя.
    </p>
    <p v-if="loadErrorMessage" role="alert">
      {{ loadErrorMessage }} <button type="button" data-test="retry-permissions" @click="loadCatalogue">Повторить</button>
    </p>
    <form @submit.prevent="save">
      <fieldset :disabled="saving || isSystem">
        <legend class="visually-hidden">Роль</legend>
        <label>
          Название
          <input v-model="name" type="text" maxlength="100" required data-test="role-name" :disabled="isSystem">
        </label>
        <label>
          Описание
          <textarea v-model="description" rows="2" data-test="role-description" />
        </label>
      </fieldset>
      <template v-if="!isSystem">
        <PermissionGroup
          v-for="group in groups" :key="group.prefix"
          v-model="selectedPermissions"
          :title="group.title" :permissions="group.items" :disabled="saving"
        />
        <p v-if="showSlotPositionNotice" class="role-editor__notice">
          Роль без прав используется как позиция в слотах.
        </p>
        <p v-if="saveError" role="alert">{{ saveError }}</p>
        <button type="submit" data-test="save-role" :disabled="saving">{{ role ? 'Сохранить' : 'Создать роль' }}</button>
      </template>
    </form>
    <button
      v-if="role && !isSystem" type="button" data-test="delete-role"
      :disabled="saving" @click="showDeleteDialog = true"
    >Удалить роль</button>
    <RoleUsageDialog
      v-if="showDeleteDialog && role" :role="role"
      @deleted="onDeleted" @close="showDeleteDialog = false"
    />
  </div>
</template>

<style scoped>
.role-editor { max-width: 32rem; }
label { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 1rem; }
input, textarea, button { font: inherit; padding: 0.65rem; border: 1px solid #8b96a6; border-radius: 0.3rem; }
button { cursor: pointer; margin-right: 0.5rem; }
button:disabled { opacity: 0.6; cursor: wait; }
fieldset { border: 0; padding: 0; margin: 0 0 1rem; }
.role-editor__notice { background: #edf1f6; padding: 0.75rem 1rem; border-radius: 0.4rem; margin: 0.5rem 0 1rem; }
[role='alert'] { color: #a32020; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
</style>
