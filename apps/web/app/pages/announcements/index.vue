<script setup lang="ts">
import AnnouncementList from '~/components/announcements/AnnouncementList.vue'
</script>

<template>
  <div class="announcements-page"><h1>Объявления</h1><p class="announcements-page__intro">Публикации для всей церкви и ваших служений.</p><AnnouncementList /></div>
</template>

<style scoped>
.announcements-page { min-width: 0; }
h1 { margin-block: 0 var(--ui-space-2); }
.announcements-page__intro { color: var(--ui-text-muted); margin-block: 0 var(--ui-space-6); }
</style>
