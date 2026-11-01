<script setup lang="ts">
defineProps<{ title: string, description: string }>()
</script>

<template>
  <div class="empty-state" role="status">
    <p class="empty-state__title">{{ title }}</p>
    <p>{{ description }}</p>
    <slot />
  </div>
</template>

<style scoped>
.empty-state { min-width: 0; padding: min(var(--ui-space-6), 24px) min(var(--ui-space-4), 16px); margin-block: var(--ui-space-4); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); background: var(--ui-surface-muted); color: var(--ui-text-muted); overflow-wrap: anywhere; }
p { margin: 0; }
p + p { margin-top: var(--ui-space-2); }
.empty-state__title { color: var(--ui-text); font-weight: 650; }
</style>
