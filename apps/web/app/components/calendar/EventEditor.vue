<script setup lang="ts">
import { matchedRouteKey, onBeforeRouteLeave } from 'vue-router'
import type { EventItem } from '~/composables/useEvents'
import { isCalendarDate } from '~/composables/useCalendarView'
import type { SlotChoice, SlotDraft } from '~/utils/eventEditor'
import { slotFieldErrors } from '~/utils/eventEditor'
import { apiErrorMessage, apiFieldErrors } from '~/utils/apiError'
import MediaUploader from '~/components/MediaUploader.vue'
import AttachmentList from '~/components/announcements/AttachmentList.vue'
import FormSection from '~/components/ui/FormSection.vue'
import UiDialog from '~/components/ui/UiDialog.vue'
import SlotEditor from './SlotEditor.vue'
const props = defineProps<{ event?: EventItem, defaultOwner?: { type: 'church' | 'ministry', ministryId?: string }, initialDate?: string }>()
const emit = defineEmits<{ saved: [event: EventItem], cancel: [] }>()
const api = useApi(), settings = useSettingsStore(), auth = useAuthStore(), { can, canIn } = useCan(), dates = useChurchDate()
const form = ref<HTMLFormElement>(), id = useId()
const ministries = ref<{ id: string, name: string }[]>([]), choices = ref<SlotChoice[]>([])
const owner = ref(props.event ? props.event.owner_type === 'church' ? 'church' : props.event.ministry!.id : props.defaultOwner?.type === 'ministry' ? props.defaultOwner.ministryId ?? '' : '')
const owners = computed(() => [...(can('calendar.church.manage') ? [{ id: 'church', name: 'Церковь' }] : []), ...ministries.value.filter(m => canIn(m.id, 'events.manage'))])
const title = ref(props.event?.title ?? ''), description = ref(props.event?.description ?? ''), location = ref(props.event?.location ?? ''), visibility = ref(props.event?.visibility ?? 'church')
const schedule = reactive({ startsDate: '', startsTime: '', endsDate: '', endsTime: '' })
const timeParts = [
  { date: 'startsDate', time: 'startsTime', prefix: 'starts', label: 'начала', field: 'starts_at' },
  { date: 'endsDate', time: 'endsTime', prefix: 'ends', label: 'окончания', field: 'ends_at' },
] as const
const localStart = computed(() => `${schedule.startsDate}T${schedule.startsTime}`), localEnd = computed(() => `${schedule.endsDate}T${schedule.endsTime}`)
const slots = ref<SlotDraft[]>([]), notify = ref(false)
const mediaIds = ref(props.event?.attachments.map(m => m.id) ?? [])
const retained = computed(() => props.event?.attachments.filter(m => mediaIds.value.includes(m.id)) ?? [])
const saving = ref(false), uploading = ref(false), uploadError = ref(''), errorMessage = ref(''), settingsError = ref(''), ministryError = ref(''), choiceError = ref(''), fieldErrors = ref<Record<string, string[]>>({})
const cancelled = computed(() => props.event?.status === 'cancelled')
const invalidSession = ref(false), permissionLost = ref(false), saved = ref(false)
const allowed = computed(() => !invalidSession.value && !permissionLost.value && (props.event ? props.event.can_manage : owners.value.some(o => o.id === owner.value)))
let choiceGeneration = 0, initGeneration = 0, saveGeneration = 0, alive = true, initializedDates = false, initializing = false
const ownerQuery = () => owner.value === 'church' ? { owner_type: 'church' } : { owner_type: 'ministry', ministry_id: owner.value }
const snapshot = () => JSON.stringify({ owner: owner.value, title: title.value, description: description.value, location: location.value, visibility: visibility.value, schedule, slots: slots.value, mediaIds: mediaIds.value, notify: notify.value })
const baseline = ref('')
watch(snapshot, () => { saved.value = false })
const dirty = computed(() => !saved.value && !invalidSession.value && !!baseline.value && (snapshot() !== baseline.value || uploading.value))
const pendingOwner = ref(''), leaving = ref(false)
let resolveLeave: ((leave: boolean) => void) | undefined
function keepEditing() { leaving.value = false; resolveLeave?.(false); resolveLeave = undefined }
function discard() {
  leaving.value = false; baseline.value = snapshot()
  if (resolveLeave) { resolveLeave(true); resolveLeave = undefined } else emit('cancel')
}
function cancelEdit() { if (saving.value) return; if (dirty.value) leaving.value = true; else emit('cancel') }
if (inject(matchedRouteKey, undefined)?.value) onBeforeRouteLeave(() => {
  if (invalidSession.value || saved.value || !dirty.value) return true
  if (saving.value) return false
  leaving.value = true
  return new Promise<boolean>(resolve => { resolveLeave = resolve })
})
function beforeUnload(event: BeforeUnloadEvent) { if (dirty.value) { event.preventDefault(); event.returnValue = '' } }
onMounted(() => { window.addEventListener('beforeunload', beforeUnload); form.value?.querySelector<HTMLInputElement>('[data-test="title"]')?.focus() })
function readout(prefix: 'starts' | 'ends') {
  const date = prefix === 'starts' ? schedule.startsDate : schedule.endsDate, time = prefix === 'starts' ? schedule.startsTime : schedule.endsTime
  return date && time ? `${date.split('-').reverse().join('.')}, ${time}` : ''
}
// An unchanged boundary keeps its original instant, including the later repeated hour.
function instant(local: string, original?: string) { return original && local === dates.toLocalInput(original) ? original : dates.toUtcIso(local) }
const duration = computed(() => {
  try {
    const seconds = (Date.parse(instant(localEnd.value, props.event?.ends_at)) - Date.parse(instant(localStart.value, props.event?.starts_at))) / 1000
    if (seconds <= 0) return ''
    const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60), rest = seconds % 60
    return [hours ? `${hours} ч` : '', minutes ? `${minutes} мин` : '', rest ? `${rest} с` : ''].filter(Boolean).join(' ')
  } catch { return '' }
})
function attrs(field: string, extra?: string) {
  return { 'aria-invalid': fieldErrors.value[field]?.length ? 'true' as const : undefined, 'aria-describedby': [extra, fieldErrors.value[field]?.length ? `${id}-${field}-error` : ''].filter(Boolean).join(' ') || undefined }
}
async function focusError() {
  await nextTick()
  form.value?.querySelector<HTMLElement>('[aria-invalid="true"], [data-test="save-error"]')?.focus()
}
async function loadChoices() {
  const generation = ++choiceGeneration, session = auth.sessionVersion; choiceError.value = ''; choices.value = []
  if (!owner.value || !allowed.value || cancelled.value || props.event) return
  try {
    const result = await api.get<{ data: SlotChoice[] }>('/calendar/slot-choices', ownerQuery())
    if (alive && generation === choiceGeneration && session === auth.sessionVersion && allowed.value) choices.value = result.data
  } catch (error) { if (alive && generation === choiceGeneration && session === auth.sessionVersion && allowed.value) choiceError.value = apiErrorMessage(error, 'Не удалось загрузить роли. Повторите загрузку.') }
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
async function initialize() {
  const generation = ++initGeneration, session = auth.sessionVersion
  initializing = true; settingsError.value = ''; ministryError.value = ''
  const current = () => alive && generation === initGeneration && session === auth.sessionVersion
  try {
    await settings.fetch()
    if (!current()) return
    if (!settings.loaded) throw new Error('settings unavailable')
    // Validate even the empty/new editor's zone before enabling time submission.
    dates.todayInChurch()
    if (!initializedDates) {
      if (props.event) {
        const [sd, st] = dates.toLocalInput(props.event.starts_at).split('T'), [ed, et] = dates.toLocalInput(props.event.ends_at).split('T')
        Object.assign(schedule, { startsDate: sd, startsTime: st, endsDate: ed, endsTime: et })
      } else {
        const date = isCalendarDate(props.initialDate) ? props.initialDate : dates.todayInChurch()
        schedule.startsDate = date; schedule.endsDate = date
      }
      initializedDates = true
    }
  } catch { if (current()) settingsError.value = 'Не удалось получить часовой пояс церкви. Повторите загрузку. Введённые значения сохранятся — проверьте их перед сохранением.' }
  if (!current()) return
  if (!props.event) {
    try { const result = await api.get<{ data: { id: string, name: string }[] }>('/ministries'); if (!current()) return; ministries.value = result.data }
    catch (error) { if (current()) ministryError.value = apiErrorMessage(error, 'Не удалось загрузить служения. Повторите загрузку.') }
    if (!current()) return
    if (!baseline.value && !owners.value.some(o => o.id === owner.value)) owner.value = owners.value[0]?.id ?? ''
  }
  await loadChoices()
  if (!current()) return
  initializing = false
  if (!baseline.value) baseline.value = snapshot()
}
watch(() => settings.timezone, () => { if (!initializing && !invalidSession.value) settingsError.value = 'Часовой пояс церкви изменился. Повторите загрузку и проверьте введённые дату и время перед сохранением.' })
watch(() => auth.permissions, () => {
  choiceGeneration++; pendingOwner.value = ''; choices.value = []
  if (props.event && !(props.event.owner_type === 'church' ? can('calendar.church.manage') : canIn(props.event.ministry!.id, 'events.manage'))) permissionLost.value = true
  if (!allowed.value) saveGeneration++
  if (allowed.value) void loadChoices()
}, { deep: true })
watch(() => props.event?.can_manage, value => { if (value === false) { saveGeneration++; choiceGeneration++; pendingOwner.value = ''; choices.value = [] } })
watch(() => auth.sessionVersion, () => {
  invalidSession.value = true; choiceGeneration++; initGeneration++; saveGeneration++
  ministries.value = []; choices.value = []; slots.value = []; mediaIds.value = []
  title.value = ''; description.value = ''; location.value = ''; owner.value = ''; Object.assign(schedule, { startsDate: '', startsTime: '', endsDate: '', endsTime: '' })
  fieldErrors.value = {}; errorMessage.value = ''; pendingOwner.value = ''; keepEditing()
}, { flush: 'sync' })
onBeforeUnmount(() => { alive = false; choiceGeneration++; initGeneration++; saveGeneration++; window.removeEventListener('beforeunload', beforeUnload); resolveLeave?.(false) })
async function save() {
  if (saved.value || saving.value || uploading.value || uploadError.value || !allowed.value || !settings.loaded || settingsError.value) return
  fieldErrors.value = props.event ? {} : slotFieldErrors(slots.value); errorMessage.value = ''
  if (!title.value.trim()) fieldErrors.value.title = ['Укажите название события.']
  let starts_at = props.event?.starts_at ?? '', ends_at = props.event?.ends_at ?? ''
  if (!cancelled.value) {
    for (const part of timeParts) {
      if (!schedule[part.date]) fieldErrors.value[part.date] = ['Укажите дату.']
      if (!schedule[part.time]) fieldErrors.value[part.time] = ['Укажите время.']
      if (fieldErrors.value[part.date] || fieldErrors.value[part.time]) continue
      try {
        const value = instant(`${schedule[part.date]}T${schedule[part.time]}`, props.event?.[part.field])
        if (part.prefix === 'starts') starts_at = value; else ends_at = value
      } catch (error) { fieldErrors.value[part.time] = [error instanceof Error ? error.message : 'Проверьте дату и время.'] }
    }
    if (!Object.keys(fieldErrors.value).some(key => /^(starts|ends)/.test(key)) && Date.parse(ends_at) <= Date.parse(starts_at)) fieldErrors.value.endsTime = ['Конец события должен быть позже начала. Проверьте дату окончания.']
  }
  if (Object.keys(fieldErrors.value).length) { void focusError(); return }
  if (slots.value.some(s => s.role_id) && choiceError.value) { errorMessage.value = 'Сначала повторите загрузку ролей.'; void focusError(); return }
  saving.value = true
  const generation = ++saveGeneration, session = auth.sessionVersion
  const current = () => alive && generation === saveGeneration && session === auth.sessionVersion && allowed.value
  try {
    const values = { title: title.value.trim(), description: description.value || null, location: location.value || null, visibility: visibility.value, media_ids: [...mediaIds.value] }
    let response: { data: EventItem }
    if (props.event) {
      const payload: Record<string, string | string[] | null> = {}
      for (const field of ['title', 'description', 'location', 'visibility'] as const) if (values[field] !== props.event[field]) payload[field] = values[field]
      if (JSON.stringify(mediaIds.value) !== JSON.stringify(props.event.attachments.map(m => m.id))) payload.media_ids = values.media_ids
      if (!cancelled.value) {
        if (localStart.value !== dates.toLocalInput(props.event.starts_at)) payload.starts_at = starts_at
        if (localEnd.value !== dates.toLocalInput(props.event.ends_at)) payload.ends_at = ends_at
      }
      response = await api.patch(`/events/${encodeURIComponent(props.event.id)}`, payload)
    } else response = await api.post('/events', { ...values, ...ownerQuery(), starts_at, ends_at, slots: slots.value.map(s => ({ ...s, label: s.label?.trim() || null })), notify: notify.value ? owner.value === 'church' ? 'all' : 'ministry' : 'none' })
    if (current()) { saved.value = true; emit('saved', response.data) }
  } catch (error) {
    if (current()) {
      errorMessage.value = apiErrorMessage(error, 'Не удалось сохранить событие. Попробуйте ещё раз.')
      const aliases: Record<string, string> = { starts_at: 'startsTime', ends_at: 'endsTime', ministry_id: 'owner_type' }
      fieldErrors.value = Object.fromEntries(Object.entries(apiFieldErrors(error)).map(([field, messages]) => [aliases[field] ?? field, messages]))
      void focusError()
    }
  } finally { if (alive && session === auth.sessionVersion) saving.value = false }
}
await initialize()
</script>
<template>
  <form ref="form" class="ui-form event-editor" novalidate @submit.prevent="save">
    <p v-if="invalidSession" role="alert">Сессия изменилась. Откройте редактор заново.</p>
    <template v-else>
      <p v-if="settingsError" role="alert">{{ settingsError }} <button type="button" class="ui-button" @click="initialize">Повторить</button></p>
      <p v-if="ministryError" role="alert">{{ ministryError }} <button type="button" class="ui-button" @click="initialize">Повторить</button></p>
      <p v-if="!allowed" role="alert">Нет права управлять этим событием.</p>
      <fieldset class="ui-fieldset" :disabled="saving || (!event && saved) || !allowed">
        <div class="event-editor__top-actions"><button type="submit" class="ui-button ui-button--primary" data-test="save-event-top" :disabled="uploading || !!uploadError || !settings.loaded || !!settingsError">{{ saving ? 'Сохраняется…' : event ? 'Сохранить изменения' : 'Создать событие' }}</button></div>
        <div class="ui-form-grid">
          <FormSection title="О событии">
            <label class="ui-field">Название события <input v-model="title" data-test="title" aria-label="Название события" maxlength="200" required v-bind="attrs('title')"><span v-if="fieldErrors.title" :id="`${id}-title-error`" class="ui-field-error" role="alert">{{ fieldErrors.title.join(' ') }}</span></label>
            <label class="ui-field">Место <input v-model="location" data-test="location" aria-label="Место" maxlength="200" v-bind="attrs('location')"><span v-if="fieldErrors.location" :id="`${id}-location-error`" class="ui-field-error" role="alert">{{ fieldErrors.location.join(' ') }}</span></label>
            <label class="ui-field">Описание <textarea v-model="description" aria-label="Описание" rows="3" maxlength="5000" v-bind="attrs('description')" /><span v-if="fieldErrors.description" :id="`${id}-description-error`" class="ui-field-error" role="alert">{{ fieldErrors.description.join(' ') }}</span></label>
            <label v-if="!event" class="ui-field">Владелец события <select :value="owner" data-test="owner" aria-label="Владелец события" v-bind="attrs('owner_type')" @change="changeOwner"><option v-for="o in owners" :key="o.id" :value="o.id" data-test="owner-option" :data-owner="o.id">{{ o.name }}</option></select><span v-if="fieldErrors.owner_type || fieldErrors.ministry_id" :id="`${id}-owner_type-error`" class="ui-field-error" role="alert">{{ (fieldErrors.owner_type ?? fieldErrors.ministry_id)?.join(' ') }}</span></label>
            <p v-else class="ui-hint">Владелец: {{ event.ministry?.name ?? 'Церковь' }}. После создания не меняется.</p>
          </FormSection>
          <FormSection title="Дата и время" :description="`Время церкви: ${settings.loaded ? settings.timezone : 'загрузка…'}. При повторе часа используется первый момент.`">
            <p v-if="cancelled" class="ui-hint">Событие отменено. Его время изменить нельзя.</p>
            <div v-for="part in timeParts" :key="part.prefix" class="event-editor__date-row">
              <label class="ui-field">Дата {{ part.label }} <input v-model="schedule[part.date]" :data-test="`${part.prefix}-date`" :aria-label="`Дата ${part.label}`" type="date" min="0001-01-01" max="9998-12-31" :disabled="cancelled || !settings.loaded || !!settingsError" required v-bind="attrs(part.date, readout(part.prefix) ? `${id}-${part.prefix}-readout` : undefined)"><span v-if="fieldErrors[part.date]" :id="`${id}-${part.date}-error`" class="ui-field-error" role="alert">{{ fieldErrors[part.date]!.join(' ') }}</span></label>
              <label class="ui-field">Время {{ part.label }} <input v-model="schedule[part.time]" :data-test="`${part.prefix}-time`" :aria-label="`Время ${part.label}`" type="time" step="1" :disabled="cancelled || !settings.loaded || !!settingsError" required v-bind="attrs(part.time, readout(part.prefix) ? `${id}-${part.prefix}-readout` : undefined)"><span v-if="fieldErrors[part.time]" :id="`${id}-${part.time}-error`" class="ui-field-error" role="alert">{{ fieldErrors[part.time]!.join(' ') }}</span></label>
              <p v-if="readout(part.prefix)" :id="`${id}-${part.prefix}-readout`" class="datetime-readout ui-hint">{{ readout(part.prefix) }}</p>
              <p v-if="fieldErrors[part.field]" :id="`${id}-${part.field}-error`" role="alert" class="ui-field-error">{{ fieldErrors[part.field]!.join(' ') }}</p>
            </div>
            <p v-if="duration" class="ui-hint" data-test="duration" aria-live="polite">Длительность: {{ duration }}</p>
            <p v-else-if="!cancelled" class="ui-hint">Выберите время начала и окончания.</p>
          </FormSection>
          <FormSection title="Видимость и уведомление">
            <label class="ui-field">Кто видит событие <select v-model="visibility" aria-label="Кто видит событие" v-bind="attrs('visibility')"><option value="church">Вся церковь</option><option v-if="owner !== 'church'" value="ministry" data-test="visibility-ministry">Служение</option><option value="assigned">Только назначенные</option></select><span v-if="fieldErrors.visibility" :id="`${id}-visibility-error`" class="ui-field-error" role="alert">{{ fieldErrors.visibility.join(' ') }}</span></label>
            <label v-if="!event" class="ui-choice"><input v-model="notify" data-test="notify" type="checkbox"> Уведомить {{ owner === 'church' ? 'всех о новом событии' : 'участников служения о новом событии' }}</label>
            <p v-else class="ui-hint">Назначенные получат уведомление, если изменится время или место.</p>
          </FormSection>
          <FormSection title="Слоты">
            <template v-if="!event">
              <p v-if="!slots.length" class="ui-hint">Слотов пока нет. Их можно добавить сейчас или после создания события.</p>
              <p v-if="choiceError" role="alert">{{ choiceError }} <button type="button" class="ui-button" @click="loadChoices">Повторить</button></p>
              <SlotEditor v-model="slots" :choices="choices" :disabled="saving || saved || !allowed" :field-errors="fieldErrors" />
            </template>
            <p v-else class="ui-hint">Слоты и назначения доступны в карточке события{{ cancelled ? '. У отменённого события их нельзя менять.' : '.' }}</p>
          </FormSection>
          <FormSection title="Вложения" class="event-editor__attachments">
            <AttachmentList :attachments="retained" />
            <ul v-if="mediaIds.length" class="event-editor__media"><li v-for="(mediaId, index) in mediaIds" :key="mediaId"><span>Вложение {{ index + 1 }}</span><button type="button" class="ui-button" :disabled="uploading" :data-test="`remove-media-${mediaId}`" @click="mediaIds = mediaIds.filter(m => m !== mediaId)">Убрать</button></li></ul>
            <MediaUploader v-model:media-ids="mediaIds" purpose="event" multiple label="Добавить вложения" :disabled="saving || saved || !allowed" @busy="uploading = $event" @error="uploadError = $event" />
            <p v-if="uploading" class="ui-hint" role="status">Дождитесь загрузки вложений перед сохранением.</p>
            <p v-if="uploadError"><button type="button" class="ui-button" @click="uploadError = ''">Продолжить без неудавшихся вложений</button></p>
            <p v-if="fieldErrors.media_ids" :id="`${id}-media_ids-error`" role="alert" class="ui-field-error">{{ fieldErrors.media_ids.join(' ') }}</p>
          </FormSection>
        </div>
        <div class="event-editor__footer">
          <p v-if="errorMessage" data-test="save-error" tabindex="-1" class="ui-field-error" role="alert">{{ errorMessage }}</p>
          <div class="ui-form-actions"><button type="button" class="ui-button" data-test="cancel-edit" @click="cancelEdit">Отменить редактирование</button><button type="submit" class="ui-button ui-button--primary" :disabled="uploading || !!uploadError || !settings.loaded || !!settingsError">{{ saving ? 'Сохраняется…' : event ? 'Сохранить изменения' : 'Создать событие' }}</button></div>
        </div>
      </fieldset>
    </template>
    <UiDialog :open="!!pendingOwner" label="Сменить владельца события?" @close="pendingOwner = ''">
      <h2>Сменить владельца события?</h2><p>Смена владельца удалит {{ slots.length }} слотов из формы. Остальные введённые значения сохранятся.</p>
      <template #actions><button type="button" class="ui-button" data-test="keep-owner" @click="pendingOwner = ''">Оставить владельца</button><button type="button" class="ui-button ui-button--danger" data-test="confirm-owner" @click="confirmOwner">Сменить и удалить слоты</button></template>
    </UiDialog>
    <UiDialog :open="leaving" label="Выйти без сохранения?" @close="keepEditing">
      <h2>Выйти без сохранения?</h2><p>Несохранённые изменения будут потеряны{{ uploading ? ', загрузка вложений прервётся' : '' }}.</p>
      <template #actions><button type="button" class="ui-button" data-test="keep-editing" @click="keepEditing">Продолжить</button><button type="button" class="ui-button ui-button--danger" data-test="discard-edit" @click="discard">Не сохранять</button></template>
    </UiDialog>
  </form>
</template>
<style scoped>
.event-editor { width: 100%; min-width: 0; overflow-wrap: anywhere; }
.event-editor__top-actions { display: flex; justify-content: flex-end; margin-bottom: var(--ui-space-6); }
.event-editor__date-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ui-space-3); min-width: 0; }
.event-editor__date-row > p { grid-column: 1 / -1; }
.event-editor__footer { margin-top: var(--ui-space-6); display: grid; gap: var(--ui-space-4); }
.event-editor__media { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--ui-space-2); }
.event-editor__media li { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ui-space-3); }
@container (min-width: 680px) { .event-editor__attachments { grid-column: 1 / -1; } }
@media (max-width: 479px) { .event-editor__date-row { grid-template-columns: minmax(0, 1fr); } }
</style>
