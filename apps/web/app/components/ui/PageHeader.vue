<script setup lang="ts">
defineProps<{ title: string, description?: string }>()
</script>

<template>
  <header class="page-header">
    <nav v-if="$slots.breadcrumbs" class="page-header__breadcrumbs" aria-label="Путь к странице">
      <slot name="breadcrumbs" />
    </nav>
    <div class="page-header__row">
      <div class="page-header__text">
        <h1>{{ title }}</h1>
        <p v-if="description">{{ description }}</p>
      </div>
      <div v-if="$slots.actions" class="page-header__actions">
        <slot name="actions" />
      </div>
    </div>
  </header>
</template>

<style scoped>
.page-header { min-width: 0; margin-bottom: var(--ui-space-6); }
.page-header__breadcrumbs { display: flex; flex-wrap: wrap; gap: var(--ui-space-2); margin-bottom: var(--ui-space-6); color: var(--ui-text-muted); font-size: .875rem; }
.page-header__row { display: flex; flex-wrap: wrap; align-items: flex-start; gap: var(--ui-space-4); }
.page-header__text { flex: 1 1 16rem; min-width: 0; }
.page-header h1 { margin: 0; }
.page-header p { margin: var(--ui-space-2) 0 0; color: var(--ui-text-muted); font-size: .875rem; overflow-wrap: anywhere; }
.page-header__actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ui-space-2); max-width: 100%; min-width: 0; }
.page-header__actions :deep(button), .page-header__actions :deep(a) { max-width: 100%; overflow-wrap: anywhere; }
</style>
