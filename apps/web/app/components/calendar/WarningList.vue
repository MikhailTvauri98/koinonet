<script setup lang="ts">
import type { AssignmentWarning, SlotCandidate } from '~/utils/assignments'

const props = defineProps<{ warnings: AssignmentWarning[], roleLabel?: string, conflicts?: SlotCandidate['conflicts'] }>()
function text(warning: AssignmentWarning): string {
  if (warning.code === 'role_mismatch') return props.roleLabel ? `У человека нет роли «${props.roleLabel}»` : 'У человека нет требуемой роли.'
  if (warning.code === 'over_capacity') return 'Слот заполнен сверх нормы'
  const names = [...new Set((props.conflicts ?? []).filter(c => c.event_id && warning.event_ids?.includes(c.event_id)).map(c => c.title))]
  if (!names.length) return 'У человека есть пересечение с другим событием.'
  const unknown = (warning.event_ids ?? []).some(id => !(props.conflicts ?? []).some(c => c.event_id === id))
  const hidden = (props.conflicts ?? []).some(c => c.event_id === null)
  return `Пересекается с: ${names.join(', ')}${hidden || unknown ? '. Есть и другие пересечения.' : ''}`
}
</script>

<template>
  <ul v-if="warnings.length" data-test="warnings" aria-label="Предупреждения о назначении" class="warnings">
    <li v-for="(warning, index) in warnings" :key="index"><span aria-hidden="true">⚠ </span>{{ text(warning) }}</li>
  </ul>
</template>

<style scoped>
.warnings[aria-label] { list-style: none; color: var(--ui-text); padding: 12px; background: var(--ui-accent-soft); border: 1px solid var(--ui-accent); border-radius: var(--ui-radius-sm); overflow-wrap: anywhere; }
.warnings li + li { margin-top: var(--ui-space-2); }
</style>
