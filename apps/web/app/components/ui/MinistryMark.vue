<script setup lang="ts">
import { computed } from 'vue'
import { ministryColorVar } from '~/utils/ministryColor'

const props = withDefaults(defineProps<{ ministry: { id: string, name: string, color?: string | null } | null, variant?: 'tag' | 'dot' }>(), { variant: 'tag' })
// Цвет никогда не единственный признак: название служения или «Церковь» всегда видно рядом.
const tint = computed(() => ministryColorVar(props.ministry))
</script>

<template>
  <span class="ministry-mark" :class="[`ministry-mark--${variant}`, { 'ui-tinted': variant === 'tag' }]" :style="{ '--tint-color': tint }">
    <span v-if="variant === 'dot'" class="ministry-mark__dot" aria-hidden="true" />
    <span class="ministry-mark__name">{{ ministry ? ministry.name : 'Церковь' }}</span>
  </span>
</template>

<style scoped>
.ministry-mark { display: inline-flex; align-items: center; gap: var(--ui-space-2); min-width: 0; max-width: 100%; font-size: .875rem; line-height: 1.35; overflow-wrap: anywhere; }
.ministry-mark--tag { padding: 2px 10px; border-radius: 999px; font-weight: 600; }
.ministry-mark--dot { color: var(--ui-text); }
.ministry-mark__dot { flex: none; width: 10px; height: 10px; border-radius: 50%; background: var(--tint-color); }
.ministry-mark__name { min-width: 0; }
</style>
