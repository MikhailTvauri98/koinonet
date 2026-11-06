<script setup lang="ts">
import type { MediaLike } from '~/utils/media'
defineProps<{ attachments: MediaLike[] }>()
</script>

<template>
  <ul v-if="attachments.length" class="attachments" role="list" aria-label="Вложения">
    <li v-for="(media, index) in attachments" :key="media.id">
      <a :href="media.url" target="_blank" rel="noopener noreferrer">
        <img v-if="media.kind === 'image' && media.thumb_url" :src="media.thumb_url" :alt="`Изображение ${index + 1}`" loading="lazy">
        <span v-else>Вложение {{ index + 1 }}</span>
      </a>
    </li>
  </ul>
</template>

<style scoped>
.attachments { display: flex; flex-wrap: wrap; gap: var(--ui-space-3); padding: 0; list-style: none; min-width: 0; }
li { min-width: 0; max-width: 100%; }
a { display: flex; align-items: center; justify-content: center; min-height: var(--ui-control-height); min-width: var(--ui-control-height); max-width: 100%; padding: var(--ui-space-2); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-sm); background: var(--ui-surface-muted); overflow-wrap: anywhere; }
img { display: block; max-width: min(160px, 100%); max-height: 120px; object-fit: contain; }
</style>
