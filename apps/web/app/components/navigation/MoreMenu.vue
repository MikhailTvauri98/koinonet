<script setup lang="ts">
defineProps<{ items: { to: string, label: string }[], adminItems: { to: string, label: string }[] }>()
const emit = defineEmits<{ close: [] }>()
const route = useRoute()
function isActive(to: string) {
  return to === '/settings/profile' ? route.path.startsWith('/settings/') : route.path === to || route.path.startsWith(to + '/')
}
</script>

<template>
  <UiDialog :open="true" label="Ещё" @close="emit('close')">
    <header class="more-menu__header">
      <h2>Ещё</h2>
      <button type="button" @click="emit('close')">Закрыть</button>
    </header>
    <div class="more-menu__links">
      <NuxtLink v-for="item in items" :key="item.to" :to="item.to" class="more-menu__link" :class="{ 'more-menu__link--active': isActive(item.to) }" :aria-current="isActive(item.to) ? 'page' : undefined" active-class="" exact-active-class="" @click="emit('close')">{{ item.label }}</NuxtLink>
    </div>
    <div v-if="adminItems.length" class="more-menu__links more-menu__admin">
      <NuxtLink v-for="item in adminItems" :key="item.to" :to="item.to" class="more-menu__link" :class="{ 'more-menu__link--active': isActive(item.to) }" :aria-current="isActive(item.to) ? 'page' : undefined" active-class="" exact-active-class="" @click="emit('close')">{{ item.label }}</NuxtLink>
    </div>
  </UiDialog>
</template>

<style scoped>
.more-menu__header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--ui-space-2); margin-bottom: var(--ui-space-4); }
.more-menu__header h2 { margin: 0; }
.more-menu__links { display: flex; flex-direction: column; gap: var(--ui-space-1); }
.more-menu__link { min-width: 0; min-height: var(--ui-control-height); padding: min(var(--ui-space-3), 12px); border-radius: var(--ui-radius-sm); text-decoration: none; color: var(--ui-text); }
.more-menu__link:hover { background: var(--ui-surface-muted); }
.more-menu__link--active { background: var(--ui-accent-soft); color: var(--ui-accent); font-weight: 600; }
.more-menu__admin { border-top: 1px solid var(--ui-border); margin-top: var(--ui-space-3); padding-top: var(--ui-space-3); }
</style>
