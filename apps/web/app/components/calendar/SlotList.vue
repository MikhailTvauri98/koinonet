<script setup lang="ts">
import type { EventSlot } from '~/composables/useEvents'
defineProps<{ slots: EventSlot[] }>()
defineEmits<{ assign: [slot: EventSlot] }>()
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
.assignee { display: flex; align-items: center; gap: 0.5rem; margin: 0.5rem 0; }
img { border-radius: 50%; object-fit: cover; }
button { font: inherit; padding: 0.5rem 0.75rem; cursor: pointer; }
</style>
