<script setup lang="ts">
import type { components } from '~~/types/api'
import type { TemplateItem, CalendarOwner } from '~/utils/templates'
import type { SlotChoice, SlotDraft } from '~/utils/eventEditor'
import type { Recurrence } from '~/utils/recurrence'
import { slotFieldErrors } from '~/utils/eventEditor'
import { isCalendarDate } from '~/composables/useCalendarView'
import FormSection from '~/components/ui/FormSection.vue'
import UiDialog from '~/components/ui/UiDialog.vue'
import { apiErrorMessage, apiFieldErrors } from '~/utils/apiError'
import RecurrenceEditor from './RecurrenceEditor.vue'
import SlotEditor from './SlotEditor.vue'
const props = defineProps<{ template?: TemplateItem, defaultOwner?: CalendarOwner }>()
const emit = defineEmits<{ saved: [template: TemplateItem], cancel: [] }>()
const api = useApi(), auth = useAuthStore(), { can, canIn } = useCan()
const session = auth.sessionVersion
const id = useId(), form = ref<HTMLFormElement | null>(null), pendingOwner = ref('')
const saved = ref(false)
function attrs(field: string) { return { 'aria-invalid': fieldErrors.value[field] ? 'true' as const : undefined, 'aria-describedby': fieldErrors.value[field] ? `${id}-${field}-error` : undefined } }
async function focusError() {
  await nextTick()
  const target = form.value?.querySelector<HTMLElement>('[aria-invalid="true"], [data-test=save-error]')
  target?.focus(); target?.scrollIntoView({ block: 'start' })
}
const ministries = ref<{ id: string, name: string }[]>([]), choices = ref<SlotChoice[]>([])
const owner = ref(props.template ? props.template.ministry?.id ?? 'church' : props.defaultOwner?.type === 'ministry' ? props.defaultOwner.ministryId ?? '' : 'church')
const owners = computed(() => [...(can('calendar.church.manage') ? [{ id: 'church', name: 'Церковь' }] : []), ...ministries.value.filter(m => canIn(m.id, 'events.manage'))])
const allowed = computed(() => session === auth.sessionVersion && !props.template?.archived && (props.template ? props.template.can_manage && (owner.value === 'church' ? can('calendar.church.manage') : canIn(owner.value, 'events.manage')) : owners.value.some(o => o.id === owner.value)))
const title = ref(props.template?.title ?? ''), description = ref(props.template?.description ?? ''), location = ref(props.template?.location ?? '')
const visibility = ref(props.template?.visibility ?? 'church'), startTime = ref(props.template?.start_time ?? '10:00'), duration = ref(props.template?.duration_minutes ?? 120)
const recurrence = ref<Recurrence>(props.template?.recurrence ? { ...props.template.recurrence } : null), active = ref(props.template?.active ?? true)
const initialSlots = props.template?.slots.map(s => ({ role_id: s.role?.id ?? null, label: s.label, required_count: s.required_count })) ?? []
const slots = ref<SlotDraft[]>(initialSlots.map(s => ({ ...s })))
const saving = ref(false), loadingOwners = ref(false), errorMessage = ref(''), ownerError = ref(''), choiceError = ref(''), fieldErrors = ref<Record<string, string[]>>({})
let generation = 0, mounted = true
const ownerQuery = () => owner.value === 'church' ? { owner_type: 'church' as const } : { owner_type: 'ministry' as const, ministry_id: owner.value }
async function loadChoices() {
  const version = ++generation; choices.value = []; choiceError.value = ''
  if (!allowed.value) return
  try { const response = await api.get<{ data: SlotChoice[] }>('/calendar/slot-choices', ownerQuery()); if (mounted && version === generation && session === auth.sessionVersion) choices.value = response.data }
  catch (error) { if (mounted && version === generation && session === auth.sessionVersion) choiceError.value = apiErrorMessage(error, 'Не удалось загрузить роли. Повторите загрузку.') }
}
async function loadOwners() {
  if (props.template) return
  loadingOwners.value = true; ownerError.value = ''
  try {
    const response = await api.get<{ data: { id: string, name: string }[] }>('/ministries')
    if (!mounted || session !== auth.sessionVersion) return
    ministries.value = response.data
    if (!slots.value.length && !owners.value.some(o => o.id === owner.value)) owner.value = owners.value[0]?.id ?? ''
  } catch (error) { if (mounted && session === auth.sessionVersion) ownerError.value = apiErrorMessage(error, 'Не удалось загрузить служения. Повторите загрузку.') }
  finally { if (mounted) loadingOwners.value = false }
}
function applyOwner(value: string) {
  owner.value = value; slots.value = []; fieldErrors.value = {}
  if (value === 'church' && visibility.value === 'ministry') visibility.value = 'church'
  void loadChoices()
}
function changeOwner(event: Event) {
  const input = event.target as HTMLSelectElement, value = input.value
  input.value = owner.value
  if (value === owner.value || !owners.value.some(o => o.id === value)) return
  if (slots.value.length) pendingOwner.value = value
  else applyOwner(value)
}
function confirmOwner() { const value = pendingOwner.value; pendingOwner.value = ''; if (allowed.value && owners.value.some(o => o.id === value)) applyOwner(value) }
watch(allowed, value => { if (!value) { generation++; choices.value = []; pendingOwner.value = '' } })
onBeforeUnmount(() => { mounted = false; generation++ })
async function save() {
  if (saving.value || saved.value || !allowed.value) return
  errorMessage.value = ''; fieldErrors.value = slotFieldErrors(slots.value)
  if (!title.value.trim()) fieldErrors.value.title = ['Укажите название шаблона.']
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime.value)) fieldErrors.value.start_time = ['Укажите время начала.']
  if (!Number.isInteger(duration.value) || duration.value < 15 || duration.value > 1440) fieldErrors.value.duration_minutes = ['Укажите длительность от 15 до 1440 минут.']
  if (recurrence.value?.type === 'biweekly' && !isCalendarDate(recurrence.value.anchor_date)) fieldErrors.value.recurrence = ['Укажите реальную опорную дату.']
  if (Object.keys(fieldErrors.value).length) { void focusError(); return }
  const slotValues = slots.value.map(s => ({ ...s, label: s.label?.trim() || null }))
  const slotsChanged = JSON.stringify(slotValues) !== JSON.stringify(initialSlots)
  if (choiceError.value && slotsChanged && slotValues.some(s => s.role_id)) { errorMessage.value = 'Сначала повторите загрузку ролей.'; void focusError(); return }
  saving.value = true
  try {
    const values = { title: title.value.trim(), description: description.value || null, location: location.value || null, visibility: visibility.value, start_time: startTime.value, duration_minutes: duration.value, recurrence: recurrence.value, active: active.value }
    let response: { data: TemplateItem }
    if (props.template) {
      const payload: components['schemas']['UpdateTemplateRequest'] = {}
      for (const field of Object.keys(values) as (keyof typeof values)[]) {
        if (JSON.stringify(values[field]) !== JSON.stringify(props.template[field])) Object.assign(payload, { [field]: values[field] })
      }
      if (slotsChanged) payload.slots = slotValues
      response = await api.patch(`/templates/${encodeURIComponent(props.template.id)}`, payload)
    } else response = await api.post('/templates', { ...values, ...ownerQuery(), slots: slotValues })
    if (mounted && session === auth.sessionVersion && allowed.value) { saved.value = true; emit('saved', response.data) }
  } catch (error) {
    if (mounted && session === auth.sessionVersion) { errorMessage.value = apiErrorMessage(error, 'Не удалось сохранить шаблон. Попробуйте ещё раз.'); fieldErrors.value = Object.fromEntries(Object.entries(apiFieldErrors(error)).map(([key, messages]) => [key.startsWith('recurrence.') ? 'recurrence' : key === 'ministry_id' ? 'owner_type' : key, messages])); void focusError() }
  } finally { if (mounted) saving.value = false }
}
await loadOwners(); await loadChoices()
</script>
<template>
  <form ref="form" class="ui-form template-editor" novalidate @submit.prevent="save">
    <p v-if="ownerError" role="alert">{{ ownerError }} <button type="button" class="ui-button" @click="loadOwners">Повторить</button></p>
    <p v-if="!allowed" role="alert">Нет права управлять этим шаблоном.</p>
    <fieldset class="ui-fieldset" :disabled="saving || saved || !allowed">
      <div class="template-editor__top-actions"><button type="submit" class="ui-button ui-button--primary" data-test="save-template-top">{{ saving ? 'Сохраняется…' : 'Сохранить' }}</button></div>
      <div class="ui-form-grid">
        <FormSection title="О шаблоне" class="template-editor__about">
          <label class="ui-field">Название шаблона <input v-model="title" aria-label="Название шаблона" data-test="title" maxlength="200" required v-bind="attrs('title')"><span v-if="fieldErrors.title" :id="`${id}-title-error`" class="ui-field-error" role="alert">{{ fieldErrors.title.join(' ') }}</span></label>
          <label class="ui-field">Место <input v-model="location" aria-label="Место" maxlength="200" v-bind="attrs('location')"><span v-if="fieldErrors.location" :id="`${id}-location-error`" class="ui-field-error" role="alert">{{ fieldErrors.location.join(' ') }}</span></label>
          <label class="ui-field">Описание <textarea v-model="description" aria-label="Описание" rows="3" maxlength="5000" v-bind="attrs('description')" /><span v-if="fieldErrors.description" :id="`${id}-description-error`" class="ui-field-error" role="alert">{{ fieldErrors.description.join(' ') }}</span></label>
          <label v-if="!template" class="ui-field">Владелец шаблона <select :value="owner" aria-label="Владелец шаблона" data-test="owner" :disabled="loadingOwners" v-bind="attrs('owner_type')" @change="changeOwner"><option v-for="o in owners" :key="o.id" :value="o.id">{{ o.name }}</option></select><span v-if="fieldErrors.owner_type || fieldErrors.ministry_id" :id="`${id}-owner_type-error`" class="ui-field-error" role="alert">{{ (fieldErrors.owner_type ?? fieldErrors.ministry_id)?.join(' ') }}</span></label>
          <p v-else class="ui-hint">Владелец: {{ template.ministry?.name ?? 'Церковь' }}. После создания не меняется.</p>
        </FormSection>
        <FormSection class="template-editor__schedule" title="Время и повторение" description="Время начала — по часам церкви. При правке шаблона оно не переводится в часовой пояс устройства.">
          <div class="template-editor__time">
            <label class="ui-field">Время начала <input v-model="startTime" aria-label="Время начала" data-test="start-time" type="time" required v-bind="attrs('start_time')"><span v-if="fieldErrors.start_time" :id="`${id}-start_time-error`" class="ui-field-error" role="alert">{{ fieldErrors.start_time.join(' ') }}</span></label>
            <label class="ui-field">Длительность, минут <input v-model.number="duration" aria-label="Длительность, минут" data-test="duration" type="number" min="15" max="1440" required v-bind="attrs('duration_minutes')"><span v-if="fieldErrors.duration_minutes" :id="`${id}-duration_minutes-error`" class="ui-field-error" role="alert">{{ fieldErrors.duration_minutes.join(' ') }}</span></label>
          </div>
          <RecurrenceEditor v-model="recurrence" :error="fieldErrors.recurrence?.join(' ')" />
        </FormSection>
        <FormSection title="Видимость и создание" class="template-editor__visibility">
          <label class="ui-field">Кто видит событие <select v-model="visibility" aria-label="Кто видит событие" v-bind="attrs('visibility')"><option value="church">Вся церковь</option><option v-if="owner !== 'church'" value="ministry">Служение</option><option value="assigned">Только назначенные</option></select><span v-if="fieldErrors.visibility" :id="`${id}-visibility-error`" class="ui-field-error" role="alert">{{ fieldErrors.visibility.join(' ') }}</span></label>
          <label class="ui-choice"><input v-model="active" type="checkbox"> Активен — автоматически создавать события по правилу повторения</label>
          <p class="ui-hint">Из шаблона создаются независимые события. Правки шаблона не меняют уже созданные события.</p>
          <p v-if="!recurrence" class="ui-hint">Без повторения события создаются вручную на выбранную дату.</p>
        </FormSection>
        <FormSection title="Слоты" class="template-editor__slots">
          <p v-if="!slots.length" class="ui-hint">Слотов пока нет. Добавьте нужные роли или свободные слоты.</p>
          <p v-if="choiceError" role="alert">{{ choiceError }} <button type="button" class="ui-button" @click="loadChoices">Повторить</button></p>
          <SlotEditor v-model="slots" :choices="choices" :disabled="saving || saved || !allowed" :field-errors="fieldErrors" />
        </FormSection>
      </div>
      <div class="template-editor__footer">
        <p v-if="errorMessage" role="alert" class="ui-field-error" data-test="save-error" tabindex="-1">{{ errorMessage }}</p>
        <p v-for="(messages, field) in Object.fromEntries(Object.entries(fieldErrors).filter(([key]) => !['title', 'description', 'location', 'owner_type', 'ministry_id', 'visibility', 'start_time', 'duration_minutes', 'recurrence'].includes(key) && !key.startsWith('slots')))" :key="field" role="alert" class="ui-field-error">{{ messages.join(' ') }}</p>
        <div class="ui-form-actions"><button type="button" class="ui-button" :disabled="saving" @click="emit('cancel')">Отменить редактирование</button><button type="submit" class="ui-button ui-button--primary">{{ saving ? 'Сохраняется…' : 'Сохранить' }}</button></div>
      </div>
    </fieldset>
    <UiDialog :open="!!pendingOwner" label="Сменить владельца шаблона?" @close="pendingOwner = ''">
      <h2>Сменить владельца шаблона?</h2><p>Смена владельца удалит {{ slots.length }} слотов из формы. Остальные введённые значения сохранятся.</p>
      <template #actions><button type="button" class="ui-button" data-test="keep-owner" @click="pendingOwner = ''">Оставить владельца</button><button type="button" class="ui-button ui-button--danger" data-test="confirm-owner" @click="confirmOwner">Сменить и удалить слоты</button></template>
    </UiDialog>
  </form>
</template>
<style scoped>
.template-editor :deep([aria-invalid="true"]), [data-test="save-error"] { scroll-margin-top: 24px; }
.template-editor { width: 100%; min-width: 0; overflow-wrap: anywhere; }
.template-editor > .ui-fieldset > .ui-form-grid { align-items: start; }
.template-editor__top-actions { display: flex; justify-content: flex-end; margin-bottom: var(--ui-space-6); }
.template-editor__time { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ui-space-3); }
.template-editor__footer { margin-top: var(--ui-space-6); display: grid; gap: var(--ui-space-4); }
@container (min-width: 680px) {
  .template-editor__about { grid-column: 1; grid-row: 1; }
  .template-editor__schedule { grid-column: 2; grid-row: 1 / span 2; }
  .template-editor__visibility { grid-column: 1; grid-row: 2; }
  .template-editor__slots { grid-column: 1 / -1; grid-row: 3; }
}
@media (max-width: 479px) { .template-editor__time { grid-template-columns: minmax(0, 1fr); } }
</style>
