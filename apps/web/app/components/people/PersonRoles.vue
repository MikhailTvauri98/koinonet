<script setup lang="ts">
import type { components } from '~~/types/api'
import type { Person } from '~/utils/people'
import { apiErrorMessage } from '~/utils/apiError'

const props = defineProps<{ person: Person, disabled?: boolean }>()
const emit = defineEmits<{ changed: [], busy: [value: boolean] }>()
const api = useApi()
const auth = useAuthStore()
const { can } = useCan()
const editing = ref(false)
const loading = ref(false)
const saving = ref(false)
const loaded = ref(false)
const errorMessage = ref('')
const choices = ref<components['schemas']['RoleResource'][]>([])
const selected = ref<string[]>([])
const opener = ref<HTMLButtonElement>()
const form = ref<HTMLFormElement>()
watch(() => loading.value || saving.value, value => emit('busy', value), { flush: 'sync' })
let generation = 0
let active = true
function reset() { generation++; editing.value = false; loading.value = false; saving.value = false; loaded.value = false; choices.value = []; selected.value = []; errorMessage.value = '' }
watch([() => props.person.id, () => auth.sessionVersion, () => auth.user?.id, () => can('roles.manage_global')], reset, { flush: 'sync' })
onBeforeUnmount(() => { active = false; reset() })
function current(version: number) { return active && version === generation && can('roles.manage_global') }
async function edit() {
  if (props.disabled || !can('roles.manage_global') || loading.value || saving.value) return
  const version = ++generation
  editing.value = true; loading.value = true; loaded.value = false; errorMessage.value = ''
  selected.value = (props.person.global_roles ?? []).map(role => role.id)
  try {
    const response = await api.get<{ data: components['schemas']['RoleResource'][] }>('/roles?scope=global')
    if (!current(version)) return
    choices.value = response.data; loaded.value = true
    await nextTick()
    if (current(version)) form.value?.querySelector<HTMLElement>('input, button')?.focus()
  } catch (error) {
    if (current(version)) errorMessage.value = apiErrorMessage(error, 'Не удалось загрузить роли. Попробуйте ещё раз.')
  } finally {
    if (current(version)) loading.value = false
  }
}
async function cancel() { reset(); await nextTick(); opener.value?.focus() }
async function save() {
  if (props.disabled || !can('roles.manage_global') || saving.value || !loaded.value) return
  const version = ++generation
  saving.value = true; errorMessage.value = ''
  try {
    await api.put(`/people/${encodeURIComponent(props.person.id)}/roles`, { role_ids: [...selected.value] })
    if (!current(version)) return
    editing.value = false
    emit('changed')
  } catch (error) {
    if (!current(version)) return
    errorMessage.value = apiErrorMessage(error, 'Не удалось сохранить роли. Попробуйте ещё раз.')
  } finally {
    if (current(version)) saving.value = false
  }
}
</script>

<template>
  <section class="person-roles">
    <h2>Глобальные роли</h2>
    <ul v-if="person.global_roles?.length" class="person-roles__tags"><li v-for="role in person.global_roles" :key="role.id">{{ role.name }}</li></ul>
    <p v-else class="ui-hint">Нет глобальных ролей.</p>
    <template v-if="can('roles.manage_global')">
      <button v-if="!editing" ref="opener" type="button" class="ui-button" data-test="edit-roles" :disabled="disabled" @click="edit">Изменить роли</button>
      <form v-else ref="form" class="ui-form" @submit.prevent="save">
        <p v-if="loading" role="status">Загрузка ролей…</p>
        <fieldset v-if="loaded" class="ui-fieldset" :disabled="disabled || saving">
          <legend>Роли человека</legend>
          <label v-for="role in choices" :key="role.id" class="ui-choice">
            <input v-model="selected" type="checkbox" :value="role.id" :data-test="`role-${role.id}`"><span>{{ role.name }}</span>
          </label>
          <p v-if="!choices.length">Глобальные роли ещё не созданы.</p>
        </fieldset>
        <p v-if="errorMessage" role="alert">{{ errorMessage }}</p>
        <button v-if="!loaded && !loading" type="button" class="ui-button" @click="edit">Повторить</button>
        <div class="ui-form-actions">
          <button type="button" class="ui-button" :disabled="disabled || saving" @click="cancel">Отмена</button>
          <button type="submit" class="ui-button ui-button--primary" data-test="save-roles" :disabled="disabled || saving || !loaded">{{ saving ? 'Сохранение…' : 'Сохранить роли' }}</button>
        </div>
      </form>
    </template>
  </section>
</template>

<style scoped>
.person-roles { min-width: 0; padding: min(var(--ui-space-6), 24px); background: var(--ui-surface); border: 1px solid var(--ui-border); border-radius: 14px; }
h2 { margin: 0 0 var(--ui-space-4); font-size: 1.25rem; }
.person-roles__tags { display: flex; flex-wrap: wrap; gap: var(--ui-space-2); list-style: none; padding: 0; margin: 0 0 var(--ui-space-4); }
.person-roles__tags li { min-width: 0; padding: var(--ui-space-2) var(--ui-space-3); border-radius: 8px; background: var(--ui-surface-muted); overflow-wrap: anywhere; }
.ui-hint { color: var(--ui-text-muted); margin-bottom: var(--ui-space-4); }
[role='alert'] { color: var(--ui-danger); }
@media (max-width: 479px) { .person-roles { padding: 16px; } }
</style>
