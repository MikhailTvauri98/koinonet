<script setup lang="ts">
import type { components } from '~~/types/api'
import { personStatuses, peopleErrorMessage, type PeopleError, type PersonCreatedResponse, type PersonStatus } from '~/utils/people'

const emit = defineEmits<{ created: [response: PersonCreatedResponse], cancel: [] }>()
const api = useApi()
const { can } = useCan()
const fields = reactive({ last_name: '', first_name: '', patronymic: '', phone: '', email: '', birth_date: '', note: '' })
const status = ref<PersonStatus>('guest')
const saving = ref(false)
const errorMessage = ref('')
const fieldErrors = ref<Record<string, string[]>>({})
const textFields = [
  { name: 'last_name', label: 'Фамилия', type: 'text', required: true, max: 100 },
  { name: 'first_name', label: 'Имя', type: 'text', required: true, max: 100 },
  { name: 'patronymic', label: 'Отчество', type: 'text', required: false, max: 100 },
  { name: 'phone', label: 'Телефон', type: 'tel', required: false, max: 100 },
  { name: 'email', label: 'Электронная почта', type: 'email', required: false, max: 254 },
  { name: 'birth_date', label: 'Дата рождения', type: 'date', required: false },
] as const

async function submit() {
  if (saving.value || !can('people.manage')) return
  errorMessage.value = ''
  fieldErrors.value = {}
  for (const name of ['last_name', 'first_name'] as const) {
    if (!fields[name].trim()) fieldErrors.value[name] = ['Заполните это поле.']
  }
  if (Object.keys(fieldErrors.value).length) return

  const body: components['schemas']['StorePersonRequest'] = {
    last_name: fields.last_name.trim(), first_name: fields.first_name.trim(),
    patronymic: fields.patronymic.trim() || null, phone: fields.phone.trim() || null,
    email: fields.email.trim() || null, birth_date: fields.birth_date || null, status: status.value,
    ...(can('people.view_notes') ? { note: fields.note.trim() || null } : {}),
  }
  saving.value = true
  try {
    emit('created', await api.post<PersonCreatedResponse>('/people', body))
  } catch (error) {
    errorMessage.value = peopleErrorMessage(error, 'Не удалось создать человека. Попробуйте ещё раз.')
    fieldErrors.value = (error as PeopleError | undefined)?.data?.errors ?? {}
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <form class="person-form" aria-labelledby="person-form-title" @submit.prevent="submit">
    <h2 id="person-form-title">Новый человек</h2>
    <fieldset :disabled="saving">
      <legend class="visually-hidden">Данные человека</legend>
      <label v-for="field in textFields" :key="field.name">
        {{ field.label }}{{ field.required ? ' *' : '' }}
        <input
          v-model="fields[field.name]" :name="field.name" :type="field.type" :required="field.required"
          :maxlength="'max' in field ? field.max : undefined" :aria-invalid="!!fieldErrors[field.name]"
          :aria-describedby="fieldErrors[field.name] ? `error-${field.name}` : undefined"
        >
        <span v-if="fieldErrors[field.name]" :id="`error-${field.name}`" class="error" role="alert">
          {{ fieldErrors[field.name]?.join(' ') }}
        </span>
      </label>
      <label>
        Статус человека
        <select v-model="status" name="status" :aria-invalid="!!fieldErrors.status">
          <option v-for="(label, value) in personStatuses" :key="value" :value="value">{{ label }}</option>
        </select>
        <span v-if="fieldErrors.status" class="error" role="alert">{{ fieldErrors.status.join(' ') }}</span>
      </label>
      <label v-if="can('people.view_notes')">
        Заметка
        <textarea v-model="fields.note" name="note" rows="3" :aria-invalid="!!fieldErrors.note" />
        <span v-if="fieldErrors.note" class="error" role="alert">{{ fieldErrors.note.join(' ') }}</span>
      </label>
    </fieldset>
    <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
    <div class="person-form__actions">
      <button type="submit" data-test="save-person" :disabled="saving">{{ saving ? 'Сохранение…' : 'Создать' }}</button>
      <button type="button" data-test="cancel-person" :disabled="saving" @click="emit('cancel')">Отмена</button>
    </div>
  </form>
</template>

<style scoped>
.person-form { padding: 1rem; border: 1px solid #c9d2df; border-radius: 0.5rem; margin: 1rem 0; }
.person-form h2 { margin-top: 0; }
fieldset { border: 0; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr)); gap: 1rem; }
label { display: flex; flex-direction: column; gap: 0.3rem; }
input, select, textarea, button { font: inherit; padding: 0.65rem; border: 1px solid #8b96a6; border-radius: 0.3rem; min-width: 0; }
.person-form__actions { display: flex; gap: 0.75rem; margin-top: 1rem; }
button { cursor: pointer; }
button[type='submit'] { background: #234e79; color: white; }
button:disabled { opacity: 0.6; cursor: wait; }
.error { color: #a32020; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
</style>
