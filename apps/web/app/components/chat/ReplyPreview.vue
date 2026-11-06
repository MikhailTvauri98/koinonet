<script setup lang="ts">
defineProps<{ reply: { id: string, sender_name?: string | null, body_preview?: string | null, deleted?: boolean }, removable?: boolean }>()

defineEmits<{ cancel: [] }>()
</script>
<template>
  <blockquote class="reply-preview">
    <div class="reply-preview__text">
      <strong>{{ reply.sender_name || 'Участник' }}</strong>
      <span>{{ reply.deleted ? 'Сообщение удалено' : reply.body_preview || 'Вложение' }}</span>
    </div>
    <button v-if="removable" type="button" aria-label="Отменить ответ" @click="$emit('cancel')">×</button>
  </blockquote>
</template>
<style scoped>
.reply-preview { margin: .25rem 0 .5rem; padding: .5rem .75rem; border-inline-start: 3px solid var(--ui-accent); border-radius: 0 .5rem .5rem 0; background: var(--ui-accent-soft); display: flex; gap: .5rem; align-items: start; font-size: .875rem; }
.reply-preview__text { flex: 1; min-width: 0; }
.reply-preview strong { display: block; color: var(--ui-accent); font-weight: 600; }
.reply-preview span { display: block; white-space: pre-wrap; overflow-wrap: anywhere; }
.reply-preview button { flex: 0 0 auto; min-width: 44px; min-height: 44px; padding: .25rem; background: transparent; border-color: transparent; }
</style>
