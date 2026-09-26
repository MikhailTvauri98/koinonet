<script setup lang="ts">
import type { components } from '~~/types/api'
import type { Person } from '~/utils/people'
import { apiErrorMessage } from '~/utils/apiError'

const props = defineProps<{ person: Person }>()
const emit = defineEmits<{ changed: [] }>()
const api = useApi()
const { can } = useCan()
const editing = ref(false)
const loading = ref(false)
const saving = ref(false)
const loaded = ref(false)
const errorMessage = ref('')
const choices = ref<components['schemas']['RoleResource'][]>([])
const selected = ref<string[]>([])

async function edit() {
  if (!can('roles.manage_global') || loading.value) return
  editing.value = true
  loading.value = true
  loaded.value = false
  errorMessage.value = ''
  selected.value = (props.person.global_roles ?? []).map(role => role.id)
  try {
    choices.value = (await api.get<{ data: components['schemas']['RoleResource'][] }>('/roles?scope=global')).data
    loaded.value = true
  } catch (error) {
    errorMessage.value = apiErrorMessage(error, 'Не удалось загрузить роли. Попробуйте ещё раз.')
  } finally {
    loading.value = false
  }
}

async function save() {
  if (!can('roles.manage_global') || saving.value || !loaded.value) return
  saving.value = true
  errorMessage.value = ''
  try {
    await api.put(`/people/${props.person.id}/roles`, { role_ids: [...selected.value] })
    editing.value = false
    emit('changed')
  } catch (error) {
    errorMessage.value = apiErrorMessage(error, 'Не удалось сохранить роли. Попробуйте ещё раз.')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section>
    <h2>Глобальные роли</h2>
    <ul v-if="person.global_roles?.length">
      <li v-for="role in person.global_roles" :key="role.id">{{ role.name }}</li>
    </ul>
    <p v-else>Нет глобальных ролей.</p>
    <template v-if="can('roles.manage_global')">
      <button v-if="!editing" type="button" data-test="edit-roles" @click="edit">Изменить роли</button>
      <form v-else @submit.prevent="save">
        <p v-if="loading" role="status">Загрузка ролей…</p>
        <fieldset v-if="loaded" :disabled="saving">
          <legend>Роли человека</legend>
          <label v-for="role in choices" :key="role.id">
            <input v-model="selected" type="checkbox" :value="role.id" :data-test="`role-${role.id}`"> {{ role.name }}
          </label>
          <p v-if="!choices.length">Глобальные роли ещё не созданы.</p>
        </fieldset>
        <p v-if="errorMessage" role="alert">{{ errorMessage }}</p>
        <button v-if="!loaded && !loading" type="button" @click="edit">Повторить</button>
        <button type="submit" data-test="save-roles" :disabled="saving || !loaded">Сохранить роли</button>
        <button type="button" :disabled="saving" @click="editing = false">Отмена</button>
      </form>
    </template>
  </section>
</template>

<style scoped>
label { display: flex; align-items: center; gap: 0.4rem; margin: 0.5rem 0; }
button { font: inherit; padding: 0.65rem; margin: 0.5rem 0.5rem 0 0; cursor: pointer; }
[role='alert'] { color: #a32020; }
</style>
