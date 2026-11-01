<script setup lang="ts">
import type { EventItem } from '~/composables/useEvents'
import type { SlotChoice, SlotDraft } from '~/utils/eventEditor'
import { slotError } from '~/utils/eventEditor'
import { apiErrorMessage, apiFieldErrors } from '~/utils/apiError'
import MediaUploader from '~/components/MediaUploader.vue'
import AttachmentList from '~/components/announcements/AttachmentList.vue'
import SlotEditor from './SlotEditor.vue'
const props = defineProps<{ event?: EventItem, defaultOwner?: { type: 'church' | 'ministry', ministryId?: string } }>()
const emit = defineEmits<{ saved: [event: EventItem], cancel: [] }>()
const api = useApi(), settings = useSettingsStore(), auth = useAuthStore(), { can, canIn } = useCan(), dates = useChurchDate()
const ministries = ref<{ id: string, name: string }[]>([]), choices = ref<SlotChoice[]>([])
const owner = ref(props.event ? props.event.owner_type === 'church' ? 'church' : props.event.ministry!.id : props.defaultOwner?.type === 'ministry' ? props.defaultOwner.ministryId ?? '' : '')
const owners = computed(() => [...(can('calendar.church.manage') ? [{ id: 'church', name: 'Церковь' }] : []), ...ministries.value.filter(m => canIn(m.id, 'events.manage'))])
const title = ref(props.event?.title ?? ''), description = ref(props.event?.description ?? ''), location = ref(props.event?.location ?? ''), visibility = ref(props.event?.visibility ?? 'church')
const starts = ref(''), ends = ref(''), slots = ref<SlotDraft[]>([]), notify = ref(false)
const startsReadoutId = useId(), endsReadoutId = useId()
function selectedLocalDateTime(value: string) {
  const [date, time] = value.split('T')
  return date && time ? `${date.split('-').reverse().join('.')}, ${time}` : ''
}
const mediaIds = ref(props.event?.attachments.map(m => m.id) ?? [])
const retained = computed(() => props.event?.attachments.filter(m => mediaIds.value.includes(m.id)) ?? [])
const saving = ref(false), uploading = ref(false), uploadError = ref(''), errorMessage = ref(''), settingsError = ref(''), choiceError = ref(''), fieldErrors = ref<Record<string, string[]>>({})
const cancelled = computed(() => props.event?.status === 'cancelled')
const allowed = computed(() => props.event ? props.event.can_manage : owners.value.some(o => o.id === owner.value))
let choiceGeneration = 0
let initializing = false
const ownerQuery = () => owner.value === 'church' ? { owner_type: 'church' } : { owner_type: 'ministry', ministry_id: owner.value }
async function loadChoices() {
  const generation = ++choiceGeneration; choiceError.value = ''; choices.value = []
  if (!owner.value || !allowed.value || cancelled.value) return
  try { const result = await api.get<{ data: SlotChoice[] }>('/calendar/slot-choices', ownerQuery()); if (generation === choiceGeneration) choices.value = result.data }
  catch (error) { if (generation === choiceGeneration) choiceError.value = apiErrorMessage(error, 'Не удалось загрузить роли. Повторите загрузку.') }
}
async function initialize() {
  initializing = true
  settingsError.value = ''
  try {
    await settings.fetch()
    if (!settings.loaded) throw new Error('settings unavailable')
    if (props.event) { starts.value = dates.toLocalInput(props.event.starts_at); ends.value = dates.toLocalInput(props.event.ends_at) }
  } catch { settingsError.value = 'Не удалось получить часовой пояс церкви. Повторите загрузку.' }
  if (!props.event) {
    try { ministries.value = (await api.get<{ data: { id: string, name: string }[] }>('/ministries')).data }
    catch (error) { errorMessage.value = apiErrorMessage(error, 'Не удалось загрузить служения. Повторите загрузку.') }
    if (!owners.value.some(o => o.id === owner.value)) owner.value = owners.value[0]?.id ?? ''
  }
  await loadChoices()
  initializing = false
}
watch(() => settings.timezone, () => { if (initializing) return; settingsError.value = 'Часовой пояс церкви изменился. Повторите загрузку перед сохранением.' })
watch(owner, () => { if (owner.value === 'church' && visibility.value === 'ministry') visibility.value = 'church'; slots.value = []; void loadChoices() })
onBeforeUnmount(() => { choiceGeneration++ })
async function save() {
  if (saving.value || uploading.value || uploadError.value || !allowed.value || !settings.loaded || settingsError.value) return
  errorMessage.value = slotError(slots.value); fieldErrors.value = {}
  if (errorMessage.value) return
  if (slots.value.some(s => s.role_id) && choiceError.value) return
  saving.value = true
  const session = auth.sessionVersion
  try {
    if (!title.value.trim()) throw new Error('Укажите название события.')
    const values = { title: title.value.trim(), description: description.value || null, location: location.value || null, visibility: visibility.value, media_ids: [...mediaIds.value] }
    let response: { data: EventItem }
    if (props.event) {
      const payload: Record<string, string | string[] | null> = {}
      for (const field of ['title', 'description', 'location', 'visibility'] as const) if (values[field] !== props.event[field]) payload[field] = values[field]
      if (JSON.stringify(mediaIds.value) !== JSON.stringify(props.event.attachments.map(m => m.id))) payload.media_ids = values.media_ids
      if (!cancelled.value) {
        if (starts.value !== dates.toLocalInput(props.event.starts_at)) payload.starts_at = dates.toUtcIso(starts.value)
        if (ends.value !== dates.toLocalInput(props.event.ends_at)) payload.ends_at = dates.toUtcIso(ends.value)
        if (Date.parse(String(payload.ends_at ?? props.event.ends_at)) <= Date.parse(String(payload.starts_at ?? props.event.starts_at))) throw new Error('Конец события должен быть позже начала.')
      }
      response = await api.patch(`/events/${encodeURIComponent(props.event.id)}`, payload)
    } else {
      const starts_at = dates.toUtcIso(starts.value), ends_at = dates.toUtcIso(ends.value)
      if (Date.parse(ends_at) <= Date.parse(starts_at)) throw new Error('Конец события должен быть позже начала.')
      response = await api.post('/events', { ...values, ...ownerQuery(), starts_at, ends_at, slots: slots.value.map(s => ({ ...s, label: s.label?.trim() || null })), notify: notify.value ? owner.value === 'church' ? 'all' : 'ministry' : 'none' })
    }
    if (session === auth.sessionVersion) emit('saved', response.data)
  } catch (error) {
    errorMessage.value = apiErrorMessage(error, error instanceof Error && !('statusCode' in error) ? error.message : 'Не удалось сохранить событие. Попробуйте ещё раз.'); fieldErrors.value = apiFieldErrors(error)
  } finally { saving.value = false }
}
await initialize()
</script>
<template>
  <form @submit.prevent="save">
    <p v-if="settingsError" role="alert">{{ settingsError }} <button type="button" @click="initialize">Повторить</button></p>
    <fieldset :disabled="saving || !allowed">
      <label v-if="!event">Владелец <select v-model="owner"><option v-for="o in owners" :key="o.id" :value="o.id" data-test="owner-option" :data-owner="o.id">{{ o.name }}</option></select></label>
      <p v-else>Владелец: {{ event.ministry?.name ?? 'Церковь' }}</p>
      <label>Видимость <select v-model="visibility"><option value="church">Вся церковь</option><option v-if="owner !== 'church'" value="ministry" data-test="visibility-ministry">Служение</option><option value="assigned">Только назначенные</option></select></label>
      <label>Название <input v-model="title" data-test="title" maxlength="200" required></label>
      <label>Описание <textarea v-model="description" maxlength="5000" /></label>
      <label>Место <input v-model="location" data-test="location" maxlength="200"></label>
      <p>Начало и конец по времени церкви: {{ settings.loaded ? settings.timezone : 'загрузка…' }}. При повторе часа используется первый момент.</p>
      <label class="datetime-field">Начало <input v-model="starts" data-test="starts-at" type="datetime-local" step="1" :aria-describedby="starts ? startsReadoutId : undefined" :disabled="cancelled || !settings.loaded" required></label>
      <p v-if="starts" :id="startsReadoutId" class="datetime-readout"><time :datetime="starts">{{ selectedLocalDateTime(starts) }}</time></p>
      <label class="datetime-field">Конец <input v-model="ends" data-test="ends-at" type="datetime-local" step="1" :aria-describedby="ends ? endsReadoutId : undefined" :disabled="cancelled || !settings.loaded" required></label>
      <p v-if="ends" :id="endsReadoutId" class="datetime-readout"><time :datetime="ends">{{ selectedLocalDateTime(ends) }}</time></p>
      <template v-if="!event"><p v-if="choiceError" role="alert">{{ choiceError }} <button type="button" @click="loadChoices">Повторить</button></p><SlotEditor v-model="slots" :choices="choices" /></template>
      <AttachmentList :attachments="retained" />
      <ul><li v-for="(id, index) in mediaIds" :key="id">Вложение {{ index + 1 }} <button type="button" :disabled="uploading" :data-test="`remove-media-${id}`" @click="mediaIds = mediaIds.filter(m => m !== id)">Убрать</button></li></ul>
      <MediaUploader v-model:media-ids="mediaIds" purpose="event" multiple label="Добавить вложения" @busy="uploading = $event" @error="uploadError = $event" />
      <p v-if="uploadError"><button type="button" @click="uploadError = ''">Продолжить без неудавшихся вложений</button></p>
      <label v-if="!event"><input v-model="notify" data-test="notify" type="checkbox"> Уведомить {{ owner === 'church' ? 'всех' : 'участников служения' }}</label>
      <p v-if="errorMessage" role="alert">{{ errorMessage }}</p><p v-for="(messages, field) in fieldErrors" :key="field" role="alert">{{ messages.join(' ') }}</p>
      <button type="submit" :disabled="uploading || !!uploadError || !settings.loaded || !!settingsError">{{ saving ? 'Сохраняется…' : 'Сохранить' }}</button><button type="button" @click="emit('cancel')">Назад</button>
    </fieldset>
  </form>
</template>
<style scoped>
form { min-width: 0; max-width: 40rem; overflow-wrap: anywhere; }
fieldset { min-inline-size: 0; max-width: 100%; margin: 0; border: 0; padding: 0; }
label { display: block; margin: var(--ui-space-4) 0; }
.datetime-field { margin-bottom: var(--ui-space-2); }
.datetime-readout { margin: 0 0 var(--ui-space-4); color: var(--ui-text-muted); overflow-wrap: anywhere; }
input:not([type='checkbox']), textarea, select { display: block; min-width: 0; max-width: 100%; width: 100%; }
button { max-width: calc(100% - var(--ui-space-1)); margin: var(--ui-space-1) var(--ui-space-1) var(--ui-space-1) 0; overflow-wrap: anywhere; }
[role='alert'] { color: var(--ui-danger); }
</style>
