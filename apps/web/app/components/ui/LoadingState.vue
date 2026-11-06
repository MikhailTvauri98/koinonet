<script setup lang="ts">
withDefaults(defineProps<{ label?: string }>(), { label: 'Загружаем…' })
</script>

<template>
  <div class="loading-state" role="status" aria-live="polite">
    <span class="loading-state__spinner" aria-hidden="true" />
    <span>{{ label }}</span>
  </div>
</template>

<style scoped>
.loading-state { display: flex; flex-wrap: wrap; align-items: center; gap: min(var(--ui-space-3), 12px); min-width: 0; padding: min(var(--ui-space-4), 16px); margin-block: var(--ui-space-3); border: 1px solid var(--ui-border); border-radius: 14px; background: var(--ui-surface); color: var(--ui-text); overflow-wrap: anywhere; }
.loading-state > span:last-child { min-width: 0; flex: 1 1 10rem; }
.loading-state__spinner { flex: 0 0 1.125rem; width: 1.125rem; height: 1.125rem; border: 2px solid var(--ui-border-strong); border-top-color: var(--ui-accent); border-radius: 50%; animation: loading-turn 1s linear infinite; }
@keyframes loading-turn { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .loading-state__spinner { animation: none; } }
</style>
