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
.attachments { display: flex; flex-wrap: wrap; gap: 1rem; padding: 0; list-style: none; }
img { max-width: 160px; max-height: 120px; object-fit: contain; }
</style>
