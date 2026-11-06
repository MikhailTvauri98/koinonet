<script setup lang="ts">
import type { components } from '~~/types/api'
import FormSection from '~/components/ui/FormSection.vue'
import { personStatuses, type Person, type PersonCreatedResponse, type PersonStatus } from '~/utils/people'
import { apiErrorMessage, apiFieldErrors } from '~/utils/apiError'

const props = defineProps<{ person?: Person }>()
const emit = defineEmits<{ created: [response: PersonCreatedResponse], updated: [], cancel: [] }>()
const api = useApi()
const auth = useAuthStore()
const { can } = useCan()
const form = ref<HTMLFormElement>()
const fieldId = useId()
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
const confirmed = ref(false)
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
const groups = computed(() => [
  { title: 'Данные человека', fields: textFields.slice(0, 3) },
  ...(contactsVisible.value ? [{ title: 'Контакты', fields: textFields.slice(3) }] : []),
])
let generation = 0
let active = true
watch([() => props.person?.id, () => auth.sessionVersion, () => auth.user?.id, () => can('people.manage'), contactsVisible, noteVisible], () => {
  generation++
  saving.value = false
  errorMessage.value = ''
  fieldErrors.value = {}
  if (!contactsVisible.value) { fields.phone = ''; fields.email = ''; fields.birth_date = '' }
  if (!noteVisible.value) fields.note = ''
}, { flush: 'sync' })
onBeforeUnmount(() => { active = false; generation++ })
function current(version: number) { return active && generation === version && can('people.manage') }
async function focusError() {
  await nextTick()
  const target = form.value?.querySelector<HTMLElement>('[aria-invalid="true"]')
  target?.focus()
  target?.scrollIntoView?.({ block: 'center', behavior: 'instant' })
}
onMounted(async () => { await nextTick(); form.value?.querySelector<HTMLInputElement>('input')?.focus() })

async function submit() {
  if (saving.value || confirmed.value || !can('people.manage')) return
  errorMessage.value = ''
  fieldErrors.value = {}
  for (const name of ['last_name', 'first_name'] as const) {
    if (!fields[name].trim()) fieldErrors.value[name] = ['Заполните это поле.']
  }
  if (Object.keys(fieldErrors.value).length) { await focusError(); return }
  const version = generation
  const body: components['schemas']['StorePersonRequest'] = {
    last_name: fields.last_name.trim(), first_name: fields.first_name.trim(),
    patronymic: fields.patronymic.trim() || null, status: status.value,
    ...(contactsVisible.value ? { phone: fields.phone.trim() || null, email: fields.email.trim() || null, birth_date: fields.birth_date || null } : {}),
    ...(noteVisible.value ? { note: fields.note.trim() || null } : {}),
  }
  saving.value = true
  try {
    if (props.person) {
      await api.patch(`/people/${encodeURIComponent(props.person.id)}`, body)
      if (!current(version)) return
      confirmed.value = true
      emit('updated')
    } else {
      const response = await api.post<PersonCreatedResponse>('/people', body)
      if (!current(version)) return
      confirmed.value = true
      emit('created', response)
    }
  } catch (error) {
    if (!current(version)) return
    errorMessage.value = apiErrorMessage(error, 'Не удалось сохранить человека. Попробуйте ещё раз.')
    fieldErrors.value = apiFieldErrors(error)
    saving.value = false
    await focusError()
  } finally {
    if (current(version)) saving.value = false
  }
}
</script>

<template>
  <form ref="form" class="person-form ui-form" :aria-labelledby="`${fieldId}-title`" @submit.prevent="submit">
    <h2 :id="`${fieldId}-title`">{{ person ? 'Редактирование человека' : 'Новый человек' }}</h2>
    <fieldset class="ui-fieldset" :disabled="saving || confirmed">
      <legend class="visually-hidden">Данные человека</legend>
      <div class="ui-form-grid">
        <FormSection v-for="(group, index) in groups" :key="group.title" :title="group.title">
          <label v-for="field in group.fields" :key="field.name" class="ui-field">
            <span :id="`${fieldId}-label-${field.name}`">{{ field.label }}<span v-if="field.required" aria-hidden="true"> *</span></span>
            <input
              v-model="fields[field.name]" :name="field.name" :type="field.type" :required="field.required"
              :maxlength="'max' in field ? field.max : undefined" :aria-invalid="!!fieldErrors[field.name]"
              :aria-labelledby="`${fieldId}-label-${field.name}`"
              :aria-describedby="fieldErrors[field.name] ? `${fieldId}-error-${field.name}` : undefined"
            >
            <span v-if="fieldErrors[field.name]" :id="`${fieldId}-error-${field.name}`" class="ui-field-error" role="alert">{{ fieldErrors[field.name]?.join(' ') }}</span>
          </label>
          <label v-if="index === 0" class="ui-field">
            <span :id="`${fieldId}-label-status`">Статус человека</span>
            <select v-model="status" name="status" :aria-invalid="!!fieldErrors.status" :aria-labelledby="`${fieldId}-label-status`" :aria-describedby="fieldErrors.status ? `${fieldId}-error-status` : undefined">
              <option v-for="(label, value) in personStatuses" :key="value" :value="value">{{ label }}</option>
            </select>
            <span v-if="fieldErrors.status" :id="`${fieldId}-error-status`" class="ui-field-error" role="alert">{{ fieldErrors.status.join(' ') }}</span>
          </label>
        </FormSection>
        <FormSection v-if="noteVisible" title="Заметка" description="Видна только носителям права видеть заметки.">
          <label class="ui-field">
            <span :id="`${fieldId}-label-note`">Заметка</span>
            <textarea v-model="fields.note" name="note" rows="4" :aria-invalid="!!fieldErrors.note" :aria-labelledby="`${fieldId}-label-note`" :aria-describedby="fieldErrors.note ? `${fieldId}-error-note` : undefined" />
            <span v-if="fieldErrors.note" :id="`${fieldId}-error-note`" class="ui-field-error" role="alert">{{ fieldErrors.note.join(' ') }}</span>
          </label>
        </FormSection>
      </div>
    </fieldset>
    <p v-if="errorMessage" role="alert">{{ errorMessage }}</p>
    <div class="ui-form-actions">
      <button type="button" class="ui-button" data-test="cancel-person" :disabled="saving" @click="emit('cancel')">Отмена</button>
      <button type="submit" class="ui-button ui-button--primary" data-test="save-person" :disabled="saving || confirmed">{{ confirmed ? 'Сохранено' : saving ? 'Сохранение…' : person ? 'Сохранить' : 'Создать' }}</button>
    </div>
  </form>
</template>

<style scoped>
.person-form { width: 100%; min-width: 0; margin-block: var(--ui-space-6); overflow-wrap: anywhere; }
.person-form > h2 { margin: 0; font-size: 1.5rem; }
.person-form input, .person-form select, .person-form textarea { min-width: 0; width: 100%; max-width: 100%; scroll-margin-block: 5rem; }
.person-form input[type='date'] { min-height: var(--ui-control-height); }
[role='alert'] { color: var(--ui-danger); }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
</style>
