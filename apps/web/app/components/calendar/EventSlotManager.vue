<script setup lang="ts">
import type { EventItem, EventSlot } from '~/composables/useEvents'
import type { SlotChoice, SlotDraft } from '~/utils/eventEditor'
import { slotError } from '~/utils/eventEditor'
import { apiErrorMessage } from '~/utils/apiError'
import UiDialog from '~/components/ui/UiDialog.vue'
import SlotEditor from './SlotEditor.vue'
const props = defineProps<{ event: EventItem, slot?: EventSlot | null, mode: 'new' | 'edit' | 'remove' }>()
const emit = defineEmits<{ saved: [], close: [] }>()
const api = useApi(), auth = useAuthStore(), { can, canIn } = useCan()
const drafts = ref<SlotDraft[]>([]), choices = ref<SlotChoice[]>([]), errorMessage = ref(''), saving = ref(false), loading = ref(false), choiceError = ref('')
const invalid = ref(false), completed = ref(false)
const allowed = computed(() => !invalid.value && props.event.can_manage && props.event.status === 'scheduled' && (props.mode === 'new' || !!props.slot && props.event.slots.some(slot => slot.id === props.slot!.id)))
const label = computed(() => props.mode === 'remove' ? 'Убрать слот?' : props.mode === 'new' ? 'Новый слот' : 'Изменить слот')
let generation = 0, alive = true
function close() { if (!saving.value) emit('close') }
async function loadChoices() {
  const token = ++generation, session = auth.sessionVersion
  choiceError.value = ''; loading.value = true
  try {
    const result = await api.get<{ data: SlotChoice[] }>('/calendar/slot-choices', { owner_type: props.event.owner_type, ...(props.event.ministry ? { ministry_id: props.event.ministry.id } : {}) })
    if (alive && token === generation && session === auth.sessionVersion && allowed.value) choices.value = result.data
  } catch (error) { if (alive && token === generation && session === auth.sessionVersion && allowed.value) choiceError.value = apiErrorMessage(error, 'Не удалось загрузить роли. Повторите загрузку.') }
  finally { if (alive && token === generation) loading.value = false }
}
function initialize() {
  generation++; errorMessage.value = ''; choiceError.value = ''; choices.value = []; completed.value = false
  drafts.value = [{ role_id: props.slot?.role?.id ?? null, label: props.slot?.label ?? null, required_count: props.slot?.required_count ?? 1 }]
  if (allowed.value && props.mode !== 'remove') void loadChoices()
}
watch([() => props.event.id, () => props.slot?.id, () => props.mode], initialize, { immediate: true })
function invalidate() { invalid.value = true; generation++; choices.value = []; drafts.value = []; emit('close') }
watch(() => auth.sessionVersion, invalidate, { flush: 'sync' })
watch(() => auth.permissions, () => {
  if (!(props.event.owner_type === 'church' ? can('calendar.church.manage') : canIn(props.event.ministry!.id, 'events.manage'))) invalidate()
}, { deep: true, flush: 'sync' })
watch(allowed, value => { if (!value) { generation++; choices.value = []; emit('close') } })
onBeforeUnmount(() => { alive = false; generation++ })
async function save() {
  if (saving.value || completed.value || !allowed.value || loading.value || choiceError.value || drafts.value.length !== 1) return
  errorMessage.value = slotError(drafts.value)
  if (errorMessage.value) return
  await mutate(() => props.mode === 'new' ? api.post(`/events/${encodeURIComponent(props.event.id)}/slots`, drafts.value[0]) : api.patch(`/slots/${encodeURIComponent(props.slot!.id)}`, drafts.value[0]))
}
async function remove() {
  if (saving.value || completed.value || !allowed.value || props.mode !== 'remove' || !props.slot) return
  await mutate(() => api.delete(`/slots/${encodeURIComponent(props.slot!.id)}`))
}
async function mutate(write: () => Promise<unknown>) {
  const token = generation, session = auth.sessionVersion
  saving.value = true; errorMessage.value = ''
  const current = () => alive && token === generation && session === auth.sessionVersion && allowed.value
  try { await write(); if (current()) { completed.value = true; emit('saved') } }
  catch (error) { if (current()) errorMessage.value = apiErrorMessage(error, 'Не удалось изменить слот. Попробуйте ещё раз.') }
  finally { if (current()) saving.value = false }
}
</script>
<template>
  <UiDialog v-if="allowed" :open="true" :label="label" @close="close">
    <h2>{{ label }}</h2>
    <template v-if="mode === 'remove'"><p>{{ slot?.label }}</p><p>Убрать слот и снять все его назначения?</p></template>
    <template v-else>
      <p v-if="loading" role="status">Загружаем роли…</p>
      <p v-if="choiceError" role="alert">{{ choiceError }} <button type="button" class="ui-button" @click="loadChoices">Повторить</button></p>
      <SlotEditor v-model="drafts" single :choices="choices" :disabled="saving || completed" />
    </template>
    <p v-if="errorMessage" role="alert">{{ errorMessage }}</p>
    <template #actions>
      <button type="button" class="ui-button" :disabled="saving" @click="close">Назад</button>
      <button v-if="mode === 'remove'" type="button" class="ui-button ui-button--danger" :disabled="saving || completed" data-test="confirm-remove-slot" @click="remove">Убрать слот</button>
      <button v-else type="button" class="ui-button ui-button--primary" :disabled="saving || completed || loading || !!choiceError || drafts.length !== 1" data-test="save-slot" @click="save">{{ saving ? 'Сохраняется…' : 'Сохранить слот' }}</button>
    </template>
  </UiDialog>
</template>
