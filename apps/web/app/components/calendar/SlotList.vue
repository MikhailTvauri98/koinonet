<script setup lang="ts">
import type { EventSlot } from '~/composables/useEvents'
import { apiErrorMessage } from '~/utils/apiError'
const props = defineProps<{ slots: EventSlot[] }>()
const emit = defineEmits<{ assign: [slot: EventSlot], changed: [] }>()
const api = useApi()
const removingId = ref<string | null>(null), removing = ref(false), removeError = ref('')
const removalSlot = computed(() => props.slots.find(s => s.can_fill && s.assignments.some(a => a.id === removingId.value)))
let active = true
onBeforeUnmount(() => { active = false })
function requestRemoval(id: string) { if (!removing.value) { removingId.value = id; removeError.value = '' } }
async function removeAssignment() {
  if (removing.value || !removalSlot.value || !removingId.value) return
  removing.value = true; removeError.value = ''
  try {
    await api.delete(`/assignments/${encodeURIComponent(removingId.value)}`)
    if (active) { removingId.value = null; emit('changed') }
  } catch (error) {
    if (active) removeError.value = apiErrorMessage(error, 'Не удалось снять назначение. Попробуйте ещё раз.')
  } finally { if (active) removing.value = false }
}
</script>

<template>
  <section aria-label="Слоты события">
    <h2>Слоты</h2>
    <p v-if="!slots.length">Слотов пока нет.</p>
    <ul class="slots">
      <li v-for="slot in slots" :key="slot.id" class="slot">
        <h3>{{ slot.label }}</h3>
        <p :data-test="`slot-${slot.id}-count`" :class="{ overfilled: slot.filled_count > slot.required_count }">{{ slot.filled_count }} из {{ slot.required_count }}</p>
        <ul v-if="slot.assignments.length" aria-label="Назначенные">
          <li v-for="assignment in slot.assignments" :key="assignment.id" class="assignee">
            <img v-if="assignment.person.photo_thumb_url && assignment.person.full_name" :src="assignment.person.photo_thumb_url" :alt="`Фото: ${assignment.person.full_name}`" width="40" height="40" loading="lazy">
            <span>{{ assignment.person.full_name ?? 'Имя скрыто' }}</span>
            <button v-if="slot.can_fill" type="button" :data-test="`remove-assignment-${assignment.id}`" :disabled="removing" @click="requestRemoval(assignment.id)">Снять назначение</button>
            <div v-if="removalSlot?.id === slot.id && removingId === assignment.id" role="group" aria-label="Подтверждение снятия назначения">
              <p>Снять назначение: {{ assignment.person.full_name ?? 'Имя скрыто' }}?</p>
              <p v-if="removeError" role="alert">{{ removeError }}</p>
              <button type="button" data-test="confirm-remove-assignment" :disabled="removing" @click="removeAssignment">Снять</button>
              <button type="button" data-test="cancel-remove-assignment" :disabled="removing" @click="removingId = null">Отмена</button>
            </div>
          </li>
        </ul>
        <p v-else>Назначений пока нет.</p>
        <button v-if="slot.can_fill" type="button" :data-test="`assign-${slot.id}`" @click="$emit('assign', slot)">Назначить</button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.slots { list-style: none; padding: 0; display: grid; gap: 1rem; }
.slot { border: 1px solid #d8dce2; border-radius: 0.5rem; padding: 1rem; overflow-wrap: anywhere; }
.overfilled { color: #9a5600; font-weight: 600; }
.assignee { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin: 0.5rem 0; }
img { border-radius: 50%; object-fit: cover; }
button { font: inherit; padding: 0.5rem 0.75rem; cursor: pointer; }
[role='alert'] { color: #a32020; }
</style>
