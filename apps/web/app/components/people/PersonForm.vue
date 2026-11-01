<script setup lang="ts">
import type { components } from '~~/types/api'
import { personStatuses, type Person, type PersonCreatedResponse, type PersonStatus } from '~/utils/people'
import { apiErrorMessage, apiFieldErrors } from '~/utils/apiError'

const props = defineProps<{ person?: Person }>()
const emit = defineEmits<{ created: [response: PersonCreatedResponse], updated: [], cancel: [] }>()
const api = useApi()
const { can } = useCan()
const fields = reactive({
  last_name: props.person?.last_name ?? '', first_name: props.person?.first_name ?? '',
  patronymic: props.person?.patronymic ?? '', phone: props.person?.contacts?.phone ?? '',
  email: props.person?.contacts?.email ?? '', birth_date: props.person?.contacts?.birth_date ?? '',
  note: props.person?.note ?? '',
})
const status = ref<PersonStatus>((props.person?.status as PersonStatus) ?? 'guest')
const contactsVisible = computed(() => !props.person || props.person.contacts !== undefined)
const noteVisible = computed(() => can('people.view_notes') && (!props.person || props.person.note !== undefined))
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
const visibleFields = computed(() => textFields.filter(field => contactsVisible.value || !['phone', 'email', 'birth_date'].includes(field.name)))

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
    patronymic: fields.patronymic.trim() || null, status: status.value,
    ...(contactsVisible.value ? {
      phone: fields.phone.trim() || null, email: fields.email.trim() || null, birth_date: fields.birth_date || null,
    } : {}),
    ...(noteVisible.value ? { note: fields.note.trim() || null } : {}),
  }
  saving.value = true
  try {
    if (props.person) {
      await api.patch(`/people/${props.person.id}`, body)
      emit('updated')
    } else {
      emit('created', await api.post<PersonCreatedResponse>('/people', body))
    }
  } catch (error) {
    errorMessage.value = apiErrorMessage(error, 'Не удалось сохранить человека. Попробуйте ещё раз.')
    fieldErrors.value = apiFieldErrors(error)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <form class="person-form" aria-labelledby="person-form-title" @submit.prevent="submit">
    <h2 id="person-form-title">{{ person ? 'Редактирование человека' : 'Новый человек' }}</h2>
    <fieldset :disabled="saving">
      <legend class="visually-hidden">Данные человека</legend>
      <label v-for="field in visibleFields" :key="field.name">
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
      <label v-if="noteVisible">
        Заметка
        <textarea v-model="fields.note" name="note" rows="3" :aria-invalid="!!fieldErrors.note" />
        <span v-if="fieldErrors.note" class="error" role="alert">{{ fieldErrors.note.join(' ') }}</span>
      </label>
    </fieldset>
    <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
    <div class="person-form__actions">
      <button type="submit" data-test="save-person" :disabled="saving">{{ saving ? 'Сохранение…' : person ? 'Сохранить' : 'Создать' }}</button>
      <button type="button" data-test="cancel-person" :disabled="saving" @click="emit('cancel')">Отмена</button>
    </div>
  </form>
</template>

<style scoped>
.person-form { width: 100%; max-width: 40rem; margin-block: var(--ui-space-6); background: var(--ui-surface); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); padding: min(var(--ui-space-6), 20px); box-shadow: var(--ui-shadow); min-width: 0; overflow-wrap: anywhere; }
.person-form h2 { margin-top: 0; }
fieldset { border: 0; padding: 0; margin: 0; min-width: 0; display: grid; gap: var(--ui-space-4); }
.person-form__actions { display: flex; flex-wrap: wrap; gap: var(--ui-space-3); margin-top: var(--ui-space-4); }
form { display: grid; gap: var(--ui-space-4); min-width: 0; }
label { display: grid; gap: var(--ui-space-2); min-width: 0; }
input:not([type='checkbox']), select, textarea { width: 100%; max-width: 100%; }
button { max-width: 100%; overflow-wrap: anywhere; }
button[type='submit'], .primary { background: var(--ui-accent); color: var(--ui-surface); border-color: var(--ui-accent); }
button[type='submit']:hover:not(:disabled), .primary:hover:not(:disabled) { background: var(--ui-accent-hover); }
.danger { color: var(--ui-danger); border-color: var(--ui-danger); }
[role='alert'], .error { color: var(--ui-danger); }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
@media (max-width: 480px) {
  /* На телефоне поверхность оболочки оставляет место полной дате и системной кнопке календаря. */
  .person-form { padding: 0; border: 0; border-radius: 0; box-shadow: none; }
}
</style>
