<script setup lang="ts">
import type { EventSlot } from '~/composables/useEvents'
import { apiErrorMessage } from '~/utils/apiError'
import UiDialog from '~/components/ui/UiDialog.vue'
const props = defineProps<{ slots: EventSlot[], canManage?: boolean, disabled?: boolean }>()
const emit = defineEmits<{ assign: [slot: EventSlot], changed: [], manage: [mode: 'new' | 'edit' | 'remove', slot?: EventSlot] }>()
const api = useApi(), auth = useAuthStore()
const removingId = ref<string | null>(null), removing = ref(false), removeError = ref(''), removedIds = ref<string[]>([])
const removalSlot = computed(() => props.slots.find(s => s.can_fill && s.assignments.some(a => a.id === removingId.value)))
const removalPerson = computed(() => removalSlot.value?.assignments.find(a => a.id === removingId.value)?.person)
let active = true, generation = 0
function resetRemoval() { generation++; removingId.value = null; removeError.value = ''; removing.value = false }
watch(() => auth.sessionVersion, () => { resetRemoval(); removedIds.value = [] }, { flush: 'sync' })
watch(removalSlot, slot => { if (!slot) resetRemoval() })
onBeforeUnmount(() => { active = false; generation++ })
function requestRemoval(id: string) { if (!removing.value && !props.disabled && !removedIds.value.includes(id)) { removingId.value = id; removeError.value = '' } }
async function removeAssignment() {
  if (removing.value || !removalSlot.value || !removingId.value || props.disabled) return
  const token = generation, session = auth.sessionVersion, id = removingId.value
  removing.value = true; removeError.value = ''
  const current = () => active && token === generation && session === auth.sessionVersion
  try {
    await api.delete(`/assignments/${encodeURIComponent(id)}`)
    if (current()) { removedIds.value.push(id); removingId.value = null; emit('changed') }
  } catch (error) { if (current()) removeError.value = apiErrorMessage(error, 'Не удалось снять назначение. Попробуйте ещё раз.') }
  finally { if (current()) removing.value = false }
}
</script>

<template>
  <section aria-label="Слоты события" class="slot-list">
    <div class="slot-list__heading"><h2>Слоты и назначения</h2><button v-if="canManage" type="button" class="ui-button" data-test="new-slot" :disabled="disabled || removing" @click="emit('manage', 'new')">Добавить слот</button></div>
    <p v-if="!slots.length" class="ui-hint">Слотов пока нет.</p>
    <ul v-else class="slots">
      <li v-for="slot in slots" :key="slot.id" class="slot">
        <div class="slot__heading"><h3>{{ slot.label }}</h3><span :data-test="`slot-${slot.id}-count`" class="slot__count" :class="{ overfilled: slot.filled_count > slot.required_count }">{{ slot.filled_count }} из {{ slot.required_count }}</span></div>
        <p class="slot__state">{{ slot.role ? slot.role.name : 'Свободный слот' }} · <span v-if="slot.filled_count > slot.required_count">Сверх нормы: {{ slot.filled_count - slot.required_count }}</span><span v-else-if="slot.filled_count === slot.required_count">Заполнен</span><span v-else>Свободно: {{ slot.required_count - slot.filled_count }}</span></p>
        <ul v-if="slot.assignments.length" aria-label="Назначенные" class="assignees">
          <li v-for="assignment in slot.assignments" :key="assignment.id" class="assignee">
            <img v-if="assignment.person.photo_thumb_url && assignment.person.full_name" :src="assignment.person.photo_thumb_url" :alt="`Фото: ${assignment.person.full_name}`" width="40" height="40" loading="lazy">
            <span>{{ assignment.person.full_name ?? 'Имя скрыто' }}<strong v-if="assignment.person.id === auth.person?.id" class="assignee__mine"> · вы</strong></span>
            <button v-if="slot.can_fill" type="button" class="ui-button" :data-test="`remove-assignment-${assignment.id}`" :disabled="disabled || removing || removedIds.includes(assignment.id)" @click="requestRemoval(assignment.id)">{{ removedIds.includes(assignment.id) ? 'Назначение снято' : 'Снять назначение' }}</button>
          </li>
        </ul>
        <p v-else class="ui-hint">Назначений пока нет.</p>
        <div class="slot__actions">
          <button v-if="slot.can_fill" type="button" class="ui-button ui-button--primary" :data-test="`assign-${slot.id}`" :disabled="disabled || removing" @click="emit('assign', slot)">Назначить</button>
          <button v-if="canManage" type="button" class="ui-button" :disabled="disabled || removing" :data-test="`edit-slot-${slot.id}`" @click="emit('manage', 'edit', slot)">Изменить слот</button>
          <button v-if="canManage" type="button" class="ui-button ui-button--danger" :disabled="disabled || removing" :data-test="`remove-slot-${slot.id}`" @click="emit('manage', 'remove', slot)">Убрать слот</button>
        </div>
      </li>
    </ul>
    <UiDialog v-if="removalSlot && removingId" :open="true" label="Подтверждение снятия назначения" @close="!removing && resetRemoval()">
      <h2>Снять назначение?</h2><p>{{ removalPerson?.full_name ?? 'Имя скрыто' }} · {{ removalSlot?.label }}</p>
      <p v-if="removeError" role="alert">{{ removeError }}</p>
      <template #actions><button type="button" class="ui-button" data-test="cancel-remove-assignment" :disabled="removing" @click="resetRemoval">Назад</button><button type="button" class="ui-button ui-button--danger" data-test="confirm-remove-assignment" :disabled="removing || disabled" @click="removeAssignment">Снять назначение</button></template>
    </UiDialog>
  </section>
</template>

<style scoped>
.slot-list { min-width: 0; }
.slot-list__heading, .slot__heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--ui-space-3); }
h2, h3 { margin: 0; }
h2 { font-size: 1.25rem; }
h3 { font-size: 1rem; }
.slots, .assignees { list-style: none; padding: 0; margin: 0; }
.slot { padding-block: var(--ui-space-6); border-top: 1px solid var(--ui-border); min-width: 0; overflow-wrap: anywhere; }
.slots { margin-top: var(--ui-space-4); }
.slot:last-child { padding-bottom: 0; }
.slot__count { background: var(--ui-accent-soft); color: var(--ui-accent); border-radius: var(--ui-radius-sm); padding: 4px 8px; font-size: .875rem; }
.slot__count.overfilled { color: var(--ui-danger); background: var(--ui-surface-muted); }
.slot__state { color: var(--ui-text-muted); font-size: .875rem; margin: var(--ui-space-2) 0 var(--ui-space-3); }
.assignee { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ui-space-3); margin-block: var(--ui-space-3); }
.assignee > span { min-width: 0; flex: 1 1 12rem; }
.assignee__mine { color: var(--ui-accent); font-weight: 500; }
img { border-radius: 50%; object-fit: cover; }
.slot__actions { display: flex; flex-wrap: wrap; gap: var(--ui-space-2); }
button { max-width: 100%; }
</style>
