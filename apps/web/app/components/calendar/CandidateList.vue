<script setup lang="ts">
import type { SlotCandidate } from '~/utils/assignments'

defineProps<{ candidates: SlotCandidate[], assignedIds: string[], disabled?: boolean }>()
defineEmits<{ select: [candidate: SlotCandidate] }>()
const { formatDateTime } = useChurchDate()
</script>

<template>
  <ul class="candidates" aria-label="Кандидаты">
    <li v-for="candidate in candidates" :key="candidate.person.id">
      <button type="button" :data-test="`candidate-${candidate.person.id}`" :disabled="disabled || assignedIds.includes(candidate.person.id)" @click="$emit('select', candidate)">
        <img v-if="candidate.person.full_name && candidate.person.photo_thumb_url" :src="candidate.person.photo_thumb_url" :alt="`Фото: ${candidate.person.full_name}`" width="40" height="40">
        <span>{{ candidate.person.full_name ?? 'Имя скрыто' }}</span>
        <span v-if="assignedIds.includes(candidate.person.id)"> — уже назначен</span>
        <span v-for="(conflict, index) in candidate.conflicts" :key="index" class="conflict" data-test="conflict">
          {{ conflict.title }}
          <template v-if="conflict.event_id && conflict.starts_at && conflict.ends_at">
            : <time :datetime="conflict.starts_at">{{ formatDateTime(conflict.starts_at) }}</time> — <time :datetime="conflict.ends_at">{{ formatDateTime(conflict.ends_at) }}</time>
          </template>
        </span>
      </button>
    </li>
    <li v-if="!candidates.length">Никого не найдено.</li>
  </ul>
</template>

<style scoped>
.candidates { list-style: none; padding: 0; display: grid; gap: 0.5rem; }
button { width: 100%; text-align: left; font: inherit; padding: 0.75rem; border: 1px solid #8b96a6; border-radius: 0.3rem; cursor: pointer; overflow-wrap: anywhere; }
button:disabled { cursor: default; opacity: 0.65; }
img { border-radius: 50%; vertical-align: middle; object-fit: cover; margin-right: 0.5rem; }
.conflict { display: block; color: #885000; margin-top: 0.3rem; }
</style>
