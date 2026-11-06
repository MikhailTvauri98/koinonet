<script setup lang="ts">
defineProps<{ title: string, description?: string }>()
const headingId = useId()
</script>

<template>
  <section class="ui-form-section" :aria-labelledby="headingId">
    <header class="ui-form-section__header">
      <h2 :id="headingId">{{ title }}</h2>
      <p v-if="description">{{ description }}</p>
    </header>
    <div class="ui-form-section__fields"><slot /></div>
  </section>
</template>

<style scoped>
.ui-form-section {
  min-width: 0;
  padding: min(var(--ui-space-6), 24px);
  border: 1px solid var(--ui-border);
  border-radius: 14px;
  background: var(--ui-surface);
  overflow-wrap: anywhere;
}
.ui-form-section__header { margin-bottom: var(--ui-space-6); }
h2 { margin: 0; font-size: 1.25rem; }
p { margin: var(--ui-space-2) 0 0; color: var(--ui-text-muted); font-size: 0.875rem; }
.ui-form-section__fields { display: grid; gap: var(--ui-space-4); min-width: 0; }
@media (max-width: 479px) { .ui-form-section { padding: 16px; } }
</style>
