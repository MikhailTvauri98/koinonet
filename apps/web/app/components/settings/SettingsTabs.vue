<script setup lang="ts">
// Вкладки настроек аккаунта: «Профиль», «Вход», «Устройства» доступны каждому
// вошедшему без прав (docs/architecture.md, 6.1), поэтому видны всегда.
</script>

<template>
  <nav aria-label="Разделы настроек" class="settings-tabs">
    <NuxtLink to="/settings/profile" exact-active-class="settings-tabs__active">Профиль</NuxtLink>
    <NuxtLink to="/settings/login" exact-active-class="settings-tabs__active">Вход</NuxtLink>
    <NuxtLink to="/settings/devices" exact-active-class="settings-tabs__active">Устройства</NuxtLink>
    <NuxtLink to="/settings/notifications" exact-active-class="settings-tabs__active">Уведомления</NuxtLink>
  </nav>
</template>

<style scoped>
.settings-tabs { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; margin-bottom: 1rem; }
.settings-tabs__active { font-weight: 600; }
</style>
