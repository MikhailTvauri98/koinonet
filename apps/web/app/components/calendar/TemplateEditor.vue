<script setup lang="ts">
import type { components } from '~~/types/api'
import type { TemplateItem, CalendarOwner } from '~/utils/templates'
import type { SlotChoice, SlotDraft } from '~/utils/eventEditor'
import type { Recurrence } from '~/utils/recurrence'
import { slotError } from '~/utils/eventEditor'
import { apiErrorMessage, apiFieldErrors } from '~/utils/apiError'
import RecurrenceEditor from './RecurrenceEditor.vue'
import SlotEditor from './SlotEditor.vue'
const props = defineProps<{ template?: TemplateItem, defaultOwner?: CalendarOwner }>()
const emit = defineEmits<{ saved: [template: TemplateItem], cancel: [] }>()
const api = useApi(), auth = useAuthStore(), { can, canIn } = useCan()
const session = auth.sessionVersion
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
    if (!owners.value.some(o => o.id === owner.value)) owner.value = owners.value[0]?.id ?? ''
  } catch (error) { if (mounted && session === auth.sessionVersion) ownerError.value = apiErrorMessage(error, 'Не удалось загрузить служения. Повторите загрузку.') }
  finally { if (mounted) loadingOwners.value = false }
}
watch(owner, () => { slots.value = []; if (owner.value === 'church' && visibility.value === 'ministry') visibility.value = 'church'; void loadChoices() })
watch(allowed, value => { if (!value) { generation++; choices.value = [] } })
onBeforeUnmount(() => { mounted = false; generation++ })
async function save() {
  if (saving.value || !allowed.value) return
  errorMessage.value = slotError(slots.value); fieldErrors.value = {}
  if (errorMessage.value) return
  if (!title.value.trim() || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime.value) || !Number.isInteger(duration.value) || duration.value < 15 || duration.value > 1440) { errorMessage.value = 'Укажите название, время и длительность от 15 до 1440 минут.'; return }
  if (recurrence.value?.type === 'biweekly' && !/^\d{4}-\d{2}-\d{2}$/.test(recurrence.value.anchor_date)) { errorMessage.value = 'Укажите опорную дату.'; return }
  const slotValues = slots.value.map(s => ({ ...s, label: s.label?.trim() || null }))
  const slotsChanged = JSON.stringify(slotValues) !== JSON.stringify(initialSlots)
  if (choiceError.value && slotsChanged && slotValues.some(s => s.role_id)) return
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
    if (mounted && session === auth.sessionVersion && allowed.value) emit('saved', response.data)
  } catch (error) {
    if (mounted && session === auth.sessionVersion) { errorMessage.value = apiErrorMessage(error, 'Не удалось сохранить шаблон. Попробуйте ещё раз.'); fieldErrors.value = apiFieldErrors(error) }
  } finally { if (mounted) saving.value = false }
}
await loadOwners(); await loadChoices()
</script>
<template>
  <form @submit.prevent="save">
    <p v-if="ownerError" role="alert">{{ ownerError }} <button type="button" @click="loadOwners">Повторить</button></p>
    <fieldset :disabled="saving || !allowed">
      <label v-if="!template">Владелец <select v-model="owner" data-test="owner" :disabled="loadingOwners"><option v-for="o in owners" :key="o.id" :value="o.id">{{ o.name }}</option></select></label>
      <p v-else>Владелец: {{ template.ministry?.name ?? 'Церковь' }}</p>
      <label>Название <input v-model="title" data-test="title" maxlength="200" required></label>
      <label>Описание <textarea v-model="description" maxlength="5000" /></label>
      <label>Место <input v-model="location" maxlength="200"></label>
      <label>Видимость <select v-model="visibility"><option value="church">Вся церковь</option><option v-if="owner !== 'church'" value="ministry">Служение</option><option value="assigned">Только назначенные</option></select></label>
      <p>Время начала — по часам церкви.</p>
      <label>Время начала <input v-model="startTime" data-test="start-time" type="time" required></label>
      <label>Длительность, минут <input v-model.number="duration" data-test="duration" type="number" min="15" max="1440" required></label>
      <RecurrenceEditor v-model="recurrence" />
      <label><input v-model="active" type="checkbox"> Активен — автоматически создавать события по правилу повторения</label>
      <p v-if="template">Изменения затронут новые события; уже созданные события сохранят свои данные.</p>
      <p v-if="choiceError" role="alert">{{ choiceError }} <button type="button" @click="loadChoices">Повторить</button></p>
      <SlotEditor v-model="slots" :choices="choices" :disabled="saving || !allowed" />
      <p v-if="errorMessage" role="alert">{{ errorMessage }}</p>
      <p v-for="(messages, field) in fieldErrors" :key="field" role="alert">{{ messages.join(' ') }}</p>
      <button type="submit">{{ saving ? 'Сохраняется…' : 'Сохранить' }}</button>
    </fieldset>
    <button type="button" :disabled="saving" @click="emit('cancel')">Назад</button>
  </form>
</template>
<style scoped>
form { min-width: 0; max-width: 40rem; overflow-wrap: anywhere; }
fieldset { min-inline-size: 0; max-width: 100%; margin: 0; border: 0; padding: 0; }
label { display: block; margin: var(--ui-space-4) 0; }
input:not([type='checkbox']), textarea, select { display: block; min-width: 0; max-width: 100%; width: 100%; }
button { max-width: calc(100% - var(--ui-space-1)); margin: var(--ui-space-1) var(--ui-space-1) var(--ui-space-1) 0; overflow-wrap: anywhere; }
[role='alert'] { color: var(--ui-danger); }
</style>
