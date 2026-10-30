<script setup lang="ts">
import type { EventItem, EventSlot } from '~/composables/useEvents'
import type { SlotChoice, SlotDraft } from '~/utils/eventEditor'
import { slotError } from '~/utils/eventEditor'
import { apiErrorMessage } from '~/utils/apiError'
import SlotEditor from './SlotEditor.vue'
const props = defineProps<{ event: EventItem }>()
const emit = defineEmits<{ saved: [] }>()
const api = useApi(), editing = ref<string | null>(null), drafts = ref<SlotDraft[]>([]), choices = ref<SlotChoice[]>([]), errorMessage = ref(''), saving = ref(false), removing = ref<string | null>(null)
async function edit(slot?: EventSlot) {
  editing.value = slot?.id ?? 'new'; removing.value = null; errorMessage.value = ''
  drafts.value = [{ role_id: slot?.role?.id ?? null, label: slot?.label ?? null, required_count: slot?.required_count ?? 1 }]
  try { choices.value = (await api.get<{ data: SlotChoice[] }>('/calendar/slot-choices', { owner_type: props.event.owner_type, ...(props.event.ministry ? { ministry_id: props.event.ministry.id } : {}) })).data }
  catch (error) { errorMessage.value = apiErrorMessage(error, 'Не удалось загрузить роли. Попробуйте ещё раз.') }
}
async function save() {
  if (saving.value || drafts.value.length !== 1) return
  errorMessage.value = slotError(drafts.value)
  if (errorMessage.value) return
  saving.value = true
  try {
    if (editing.value === 'new') await api.post(`/events/${encodeURIComponent(props.event.id)}/slots`, drafts.value[0])
    else await api.patch(`/slots/${encodeURIComponent(editing.value!)}`, drafts.value[0])
    editing.value = null; emit('saved')
  } catch (error) { errorMessage.value = apiErrorMessage(error, 'Не удалось сохранить слот. Попробуйте ещё раз.') }
  finally { saving.value = false }
}
async function remove() {
  if (saving.value || !removing.value) return
  saving.value = true
  try { await api.delete(`/slots/${encodeURIComponent(removing.value)}`); removing.value = null; emit('saved') }
  catch (error) { errorMessage.value = apiErrorMessage(error, 'Не удалось убрать слот. Попробуйте ещё раз.') }
  finally { saving.value = false }
}
</script>
<template>
  <section v-if="event.can_manage && event.status === 'scheduled'" aria-label="Управление слотами">
    <h2>Управление слотами</h2>
    <ul><li v-for="slot in event.slots" :key="slot.id">{{ slot.label }} <button type="button" :disabled="saving" :data-test="`edit-slot-${slot.id}`" @click="edit(slot)">Изменить слот</button><button type="button" :disabled="saving" @click="removing = slot.id; editing = null">Убрать слот</button></li></ul>
    <button type="button" :disabled="saving" data-test="new-slot" @click="edit()">Добавить слот</button>
    <div v-if="removing" role="dialog" aria-label="Убрать слот"><p>Убрать слот и снять все его назначения?</p><button type="button" :disabled="saving" data-test="confirm-remove-slot" @click="remove">Подтвердить</button><button type="button" :disabled="saving" @click="removing = null">Назад</button></div>
    <div v-if="editing"><SlotEditor v-model="drafts" single :choices="choices" :disabled="saving" /><button type="button" :disabled="saving || drafts.length !== 1" data-test="save-slot" @click="save">Сохранить слот</button><button type="button" :disabled="saving" @click="editing = null">Назад</button></div>
    <p v-if="errorMessage" role="alert">{{ errorMessage }}</p>
  </section>
</template>
