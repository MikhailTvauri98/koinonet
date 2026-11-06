<script setup lang="ts">
import FormSection from '~/components/ui/FormSection.vue'
import PermissionGroup from '~/components/roles/PermissionGroup.vue'
import RoleUsageDialog from '~/components/roles/RoleUsageDialog.vue'
import { PERMISSION_GROUP_LABELS, permissionGroupPrefix, type PermissionCatalogueEntry, type RoleLike } from '~/utils/roles'
import { apiErrorMessage, apiFieldErrors } from '~/utils/apiError'

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
  busy: [value: boolean]
}>()

const api = useApi()
const auth = useAuthStore()
const session = auth.sessionVersion
let active = true
let generation = 0
const valid = (version: number) => active && auth.sessionVersion === session && generation === version
onBeforeUnmount(() => { active = false; generation++ })
const fieldId = useId()
const form = ref<HTMLFormElement>()
const fieldErrors = ref<Record<string, string[]>>({})
const saved = ref(false)
const catalogue = ref<PermissionCatalogueEntry[]>([])
const loadErrorMessage = ref('')
const name = ref('')
const description = ref('')
const selectedPermissions = ref<string[]>([])
const saving = ref(false)
watch(saving, value => emit('busy', value), { flush: 'sync' })
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
  fieldErrors.value = {}
  saved.value = false
  saving.value = false
  generation++
  showDeleteDialog.value = false
}

async function loadCatalogue() {
  const version = generation
  loadErrorMessage.value = ''
  try {
    const response = await api.get<{ data: PermissionCatalogueEntry[] }>('/permissions')
    if (valid(version)) catalogue.value = response.data
  } catch (error) {
    if (valid(version)) loadErrorMessage.value = apiErrorMessage(error, 'Не удалось загрузить каталог прав. Попробуйте ещё раз.')
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

watch([() => props.role?.id, () => props.scope, () => props.ministryId], resetForm)
resetForm()
await loadCatalogue()

async function save() {
  if (saving.value || isSystem.value || !valid(generation) || loadErrorMessage.value) return
  if (!name.value.trim()) {
    fieldErrors.value = { name: ['Заполните название.'] }
    await nextTick()
    form.value?.querySelector<HTMLElement>('[data-test=role-name]')?.focus()
    return
  }
  const version = generation
  saving.value = true
  saved.value = false
  fieldErrors.value = {}
  saveError.value = ''
  try {
    if (props.role) {
      const response = await api.patch<{ data: RoleLike }>(`/roles/${encodeURIComponent(props.role.id)}`, {
        name: name.value.trim(),
        description: description.value.trim() || null,
        permissions: [...selectedPermissions.value],
      })
      if (!valid(version)) return
      saved.value = true
      emit('updated', response.data)
    } else if (props.scope === 'global') {
      const response = await api.post<{ data: RoleLike }>('/roles', {
        scope: 'global',
        name: name.value.trim(),
        description: description.value.trim() || null,
        permissions: [...selectedPermissions.value],
      })
      if (!valid(version)) return
      saved.value = true
      emit('created', response.data)
    } else {
      if (!props.ministryId) return
      const response = await api.post<{ data: RoleLike }>(`/ministries/${encodeURIComponent(props.ministryId)}/roles`, {
        name: name.value.trim(),
        description: description.value.trim() || null,
        permissions: [...selectedPermissions.value],
      })
      if (!valid(version)) return
      saved.value = true
      emit('created', response.data)
    }
  } catch (error) {
    if (!valid(version)) return
    fieldErrors.value = apiFieldErrors(error)
    saveError.value = apiErrorMessage(error, 'Не удалось сохранить роль. Попробуйте ещё раз.')

  } finally {
    if (valid(version)) {
      saving.value = false
      await nextTick()
      if (valid(version) && Object.keys(fieldErrors.value).length) form.value?.querySelector<HTMLElement>('[aria-invalid=true]')?.focus()
    }
  }
}

function onDeleted(roleId: string) {
  showDeleteDialog.value = false
  emit('deleted', roleId)
}
</script>

<template>
  <div class="role-editor">
    <p v-if="isSystem" class="role-editor__notice">Это системная роль: даёт все права церкви, имя и права не редактируются, удалить нельзя.</p>
    <p v-if="loadErrorMessage" role="alert">{{ loadErrorMessage }} <button type="button" data-test="retry-permissions" @click="loadCatalogue">Повторить</button></p>
    <form ref="form" class="ui-form" @submit.prevent="save">
      <FormSection title="О роли">
        <fieldset class="ui-fieldset" :disabled="saving || isSystem">
          <legend class="visually-hidden">Данные роли</legend>
          <div class="ui-field">
            <label :for="`${fieldId}-name`">Название</label>
            <input :id="`${fieldId}-name`" v-model="name" type="text" maxlength="100" required data-test="role-name" :disabled="isSystem" :aria-invalid="!!fieldErrors.name" :aria-describedby="fieldErrors.name ? `${fieldId}-name-error` : undefined">
            <p v-if="fieldErrors.name" :id="`${fieldId}-name-error`" class="ui-field-error" role="alert">{{ fieldErrors.name.join(' ') }}</p>
          </div>
          <div class="ui-field">
            <label :for="`${fieldId}-description`">Описание</label>
            <textarea :id="`${fieldId}-description`" v-model="description" rows="2" data-test="role-description" :aria-invalid="!!fieldErrors.description" :aria-describedby="fieldErrors.description ? `${fieldId}-description-error` : undefined" />
            <p v-if="fieldErrors.description" :id="`${fieldId}-description-error`" class="ui-field-error" role="alert">{{ fieldErrors.description.join(' ') }}</p>
          </div>
        </fieldset>
      </FormSection>
      <template v-if="!isSystem">
        <FormSection title="Права роли" description="Отметьте разрешённые действия. Права сгруппированы по разделам.">
          <PermissionGroup v-for="group in groups" :key="group.prefix" v-model="selectedPermissions" :title="group.title" :permissions="group.items" :disabled="saving || !!loadErrorMessage" />
          <p v-if="fieldErrors.permissions" class="ui-field-error" role="alert">{{ fieldErrors.permissions.join(' ') }}</p>
          <p v-if="showSlotPositionNotice" class="role-editor__notice">Роль без прав используется как позиция в слотах.</p>
        </FormSection>
        <p v-if="saveError" role="alert">{{ saveError }}</p>
        <p v-if="saved" role="status">Роль сохранена.</p>
        <div class="ui-form-actions">
          <button v-if="role" type="button" class="ui-button ui-button--danger" data-test="delete-role" :disabled="saving" @click="showDeleteDialog = true">Удалить роль</button>
          <button type="submit" class="ui-button ui-button--primary" data-test="save-role" :disabled="saving || !!loadErrorMessage">{{ saving ? 'Сохранение…' : role ? 'Сохранить' : 'Создать роль' }}</button>
        </div>
      </template>
    </form>
    <RoleUsageDialog v-if="showDeleteDialog && role" :role="role" @deleted="onDeleted" @close="showDeleteDialog = false" />
  </div>
</template>

<style scoped>
.role-editor { min-width: 0; width: 100%; overflow-wrap: anywhere; }
.ui-fieldset { display: grid; gap: var(--ui-space-4); }
.role-editor__notice { background: var(--ui-surface-muted); padding: var(--ui-space-4); border-radius: var(--ui-radius-sm); margin: 0 0 var(--ui-space-4); }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
input, textarea { scroll-margin-block: 6rem; }
</style>
