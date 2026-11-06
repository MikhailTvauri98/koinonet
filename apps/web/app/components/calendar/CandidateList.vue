<script setup lang="ts">
import type { SlotCandidate } from '~/utils/assignments'

defineProps<{ candidates: SlotCandidate[], assignedIds: string[], disabled?: boolean }>()
defineEmits<{ select: [candidate: SlotCandidate] }>()
function initials(name: string | null) { return name?.split(/\s+/).slice(0, 2).map(part => part[0]).join('') ?? '•' }
const { formatDateTime } = useChurchDate()
</script>

<template>
  <ul class="candidates" aria-label="Кандидаты">
    <li v-for="candidate in candidates" :key="candidate.person.id">
      <button type="button" :data-test="`candidate-${candidate.person.id}`" :disabled="disabled || assignedIds.includes(candidate.person.id)" @click="$emit('select', candidate)">
        <img v-if="candidate.person.full_name && candidate.person.photo_thumb_url" :src="candidate.person.photo_thumb_url" :alt="`Фото: ${candidate.person.full_name}`" width="40" height="40">
        <span v-else class="initials" aria-hidden="true">{{ initials(candidate.person.full_name) }}</span>
        <span class="candidate-content"><span class="candidate-name">{{ candidate.person.full_name ?? 'Имя скрыто' }}</span>
        <span v-if="assignedIds.includes(candidate.person.id)"> — уже назначен</span>
        <span v-for="(conflict, index) in candidate.conflicts" :key="index" class="conflict" data-test="conflict">
          <span aria-hidden="true">⚠ </span>{{ conflict.title }}
          <template v-if="conflict.event_id && conflict.starts_at && conflict.ends_at">
            : <time :datetime="conflict.starts_at">{{ formatDateTime(conflict.starts_at) }}</time> — <time :datetime="conflict.ends_at">{{ formatDateTime(conflict.ends_at) }}</time>
          </template>
        </span>
        </span>
      </button>
    </li>
    <li v-if="!candidates.length">Никого не найдено.</li>
  </ul>
</template>

<style scoped>
.candidates[aria-label] { list-style: none; padding: 0; margin-block: var(--ui-space-3); display: grid; gap: var(--ui-space-2); }
button { display: flex; align-items: flex-start; gap: 12px; width: 100%; min-height: 64px; text-align: left; font: inherit; padding: 12px; background: var(--ui-surface-muted); color: var(--ui-text); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-sm); cursor: pointer; overflow-wrap: anywhere; }
button:hover:enabled { border-color: var(--ui-accent); background: var(--ui-accent-soft); }
button:disabled { cursor: default; opacity: 1; }
button:disabled .candidate-name { color: var(--ui-text-muted); }
img, .initials { width: 40px; height: 40px; flex: 0 0 40px; border-radius: 50%; object-fit: cover; }
.initials { font-size: 0.875rem; display: grid; place-items: center; background: var(--ui-accent-soft); color: var(--ui-accent); }
.candidate-content { min-width: 0; align-self: center; }
.candidate-name { font-weight: 600; }
.conflict { display: block; color: var(--ui-text-muted); font-size: 0.875rem; margin-top: var(--ui-space-1); }
@media (max-width: 360px) {
  button { flex-wrap: wrap; }
  .candidate-content { flex: 1 1 100%; }
}
</style>
