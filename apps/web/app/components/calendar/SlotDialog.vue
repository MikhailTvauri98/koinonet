<script setup lang="ts">
import type { EventItem, EventSlot } from '~/composables/useEvents'
import { apiErrorMessage } from '~/utils/apiError'
import UiAvatar from '~/components/ui/UiAvatar.vue'
import UiDialog from '~/components/ui/UiDialog.vue'
import AssignDialog from './AssignDialog.vue'
import EventSlotManager from './EventSlotManager.vue'
const props = defineProps<{ event: EventItem, slot: EventSlot, disabled?: boolean }>()
const emit = defineEmits<{ assignmentsChanged: [], slotChanged: [], slotRemoved: [], close: [] }>()
const api = useApi(), auth = useAuthStore()
const nested = ref<'assign' | 'edit' | 'remove' | null>(null)
const removingId = ref<string | null>(null), removing = ref(false), removeError = ref(''), removedIds = ref<string[]>([])
const structural = computed(() => props.event.can_manage && props.event.status === 'scheduled')
const usable = computed(() => props.slot.can_fill || structural.value)
const removalPerson = computed(() => props.slot.can_fill ? props.slot.assignments.find(a => a.id === removingId.value)?.person : undefined)
const free = computed(() => props.slot.required_count - props.slot.filled_count)
let active = true, generation = 0
function resetRemoval() { generation++; removingId.value = null; removeError.value = ''; removing.value = false }
function dismiss() { if (!active) return; active = false; generation++; nested.value = null; removingId.value = null; emit('close') }
watch(() => auth.sessionVersion, dismiss, { flush: 'sync' })
watch(usable, value => { if (!value) dismiss() }, { flush: 'sync' })
watch(removalPerson, person => { if (removingId.value && !person) resetRemoval() })
onBeforeUnmount(() => { active = false; generation++ })
function requestRemoval(id: string) { if (!removing.value && !props.disabled && !removedIds.value.includes(id)) { removingId.value = id; removeError.value = '' } }
async function removeAssignment() {
  if (removing.value || !removalPerson.value || !removingId.value || props.disabled) return
  const token = generation, session = auth.sessionVersion, id = removingId.value
  removing.value = true; removeError.value = ''
  const current = () => active && token === generation && session === auth.sessionVersion
  try {
    await api.delete(`/assignments/${encodeURIComponent(id)}`)
    if (current()) { removedIds.value.push(id); removingId.value = null; emit('assignmentsChanged') }
  } catch (error) { if (current()) removeError.value = apiErrorMessage(error, 'Не удалось снять назначение. Попробуйте ещё раз.') }
  finally { if (current()) removing.value = false }
}
function close() { if (!removing.value) dismiss() }
function slotSaved() { const removed = nested.value === 'remove'; nested.value = null; if (removed) emit('slotRemoved'); else emit('slotChanged') }
</script>

<template>
  <UiDialog :open="true" :label="`Слот: ${slot.label}`" @close="close">
    <h2>{{ slot.label }}</h2>
    <p class="slot-dialog__state"><span :data-test="`dialog-slot-${slot.id}-count`" :class="{ overfilled: free < 0 }">{{ slot.filled_count }} из {{ slot.required_count }}</span> · <span v-if="free < 0">Сверх нормы: {{ -free }}</span><span v-else-if="free === 0">Заполнен</span><span v-else>Свободно: {{ free }}</span></p>
    <p v-if="disabled" role="status">Действия недоступны до обновления состава. Закройте окно и при ошибке нажмите «Повторить загрузку» в карточке события.</p>
    <ul v-if="slot.assignments.length" aria-label="Назначенные" class="slot-dialog__people">
      <li v-for="assignment in slot.assignments" :key="assignment.id">
        <UiAvatar :id="assignment.person.id" :name="assignment.person.short_name" :photo-url="assignment.person.short_name ? assignment.person.photo_thumb_url : null" />
        <span class="slot-dialog__name">{{ assignment.person.short_name ?? 'Имя скрыто' }}<strong v-if="assignment.person.id === auth.person?.id" class="slot-dialog__mine"> · вы</strong></span>
        <button v-if="slot.can_fill" type="button" class="ui-button" :data-test="`remove-assignment-${assignment.id}`" :disabled="disabled || removing || removedIds.includes(assignment.id)" @click="requestRemoval(assignment.id)">{{ removedIds.includes(assignment.id) ? 'Назначение снято' : 'Снять назначение' }}</button>
      </li>
    </ul>
    <p v-else-if="!slot.filled_count" class="ui-hint">Никто не назначен</p>
    <template #actions>
      <button type="button" class="ui-button ui-button--quiet" data-test="close-slot-dialog" :disabled="removing" @click="close">Закрыть</button>
      <button v-if="structural" type="button" class="ui-button" :data-test="`remove-slot-${slot.id}`" :disabled="disabled || removing" @click="nested = 'remove'">Убрать слот</button>
      <button v-if="structural" type="button" class="ui-button" :data-test="`edit-slot-${slot.id}`" :disabled="disabled || removing" @click="nested = 'edit'">Изменить слот</button>
      <button v-if="slot.can_fill" type="button" class="ui-button ui-button--primary" :data-test="`dialog-assign-${slot.id}`" :disabled="disabled || removing" @click="nested = 'assign'">Назначить</button>
    </template>
  </UiDialog>
  <UiDialog v-if="removingId && removalPerson" :open="true" label="Подтверждение снятия назначения" @close="!removing && resetRemoval()">
    <h2>Снять назначение?</h2><p>{{ removalPerson.short_name ?? 'Имя скрыто' }} · {{ slot.label }}</p>
    <p v-if="removeError" role="alert">{{ removeError }}</p>
    <template #actions><button type="button" class="ui-button" data-test="cancel-remove-assignment" :disabled="removing" @click="resetRemoval">Назад</button><button type="button" class="ui-button ui-button--danger" data-test="confirm-remove-assignment" :disabled="removing || disabled" @click="removeAssignment">Снять назначение</button></template>
  </UiDialog>
  <AssignDialog v-if="nested === 'assign'" :key="`${event.id}-${slot.id}`" v-bind="{ slot }" :event-id="event.id" :disabled="disabled" @assigned="emit('assignmentsChanged')" @close="nested = null" />
  <EventSlotManager v-if="nested === 'edit' || nested === 'remove'" v-bind="{ slot }" :event="event" :mode="nested" @saved="slotSaved" @close="nested = null" />
</template>

<style scoped>
h2 { font-size: 1.25rem; overflow-wrap: anywhere; }
.slot-dialog__state { color: var(--ui-text-muted); font-size: .875rem; margin: var(--ui-space-2) 0 var(--ui-space-4); }
.overfilled { color: var(--ui-danger); }
.slot-dialog__people.slot-dialog__people { list-style: none; padding: 0; margin: 0; }
.slot-dialog__people li { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ui-space-3); margin-block: var(--ui-space-3); padding: 0; }
.slot-dialog__name { min-width: 0; flex: 1 1 5rem; }
.slot-dialog__mine { color: var(--ui-accent); font-weight: 500; }
[role='alert'] { color: var(--ui-danger); }
</style>
