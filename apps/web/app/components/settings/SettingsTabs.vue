<script setup lang="ts">
// Вкладки настроек аккаунта: «Профиль», «Безопасность», «Устройства» доступны каждому
// вошедшему без прав (docs/architecture.md, 6.1), поэтому видны всегда.
</script>

<template>
  <nav aria-label="Разделы настроек" class="settings-tabs">
    <NuxtLink to="/settings/profile" exact-active-class="settings-tabs__active">Профиль</NuxtLink>
    <NuxtLink to="/settings/login" exact-active-class="settings-tabs__active">Безопасность</NuxtLink>
    <NuxtLink to="/settings/appearance" exact-active-class="settings-tabs__active">Оформление</NuxtLink>
    <NuxtLink to="/settings/devices" exact-active-class="settings-tabs__active">Устройства</NuxtLink>
    <NuxtLink to="/settings/notifications" exact-active-class="settings-tabs__active">Уведомления</NuxtLink>
    <NuxtLink to="/settings/ical" exact-active-class="settings-tabs__active">Календарь телефона</NuxtLink>
  </nav>
</template>

<style scoped>
.settings-tabs { display: flex; flex-wrap: wrap; gap: min(var(--ui-space-2), 8px); margin-bottom: var(--ui-space-6); padding-bottom: min(var(--ui-space-4), 16px); border-bottom: 1px solid var(--ui-border); min-width: 0; }
.settings-tabs a { display: flex; align-items: center; min-height: 44px; max-width: 100%; padding: min(var(--ui-space-2), 8px) min(var(--ui-space-3), 12px); border: 1px solid transparent; border-radius: var(--ui-radius-sm); color: var(--ui-text-muted); text-decoration: none; overflow-wrap: anywhere; }
.settings-tabs a:hover { background: var(--ui-surface-muted); color: var(--ui-accent); }
.settings-tabs a.settings-tabs__active { background: var(--ui-accent-soft); color: var(--ui-accent); border-color: var(--ui-border); font-weight: 650; }
</style>
