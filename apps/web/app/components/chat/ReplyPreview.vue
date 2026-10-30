<script setup lang="ts">
defineProps<{ reply: { id: string, sender_name?: string | null, body_preview?: string | null, deleted?: boolean }, removable?: boolean }>()
defineEmits<{ cancel: [] }>()
</script>
<template>
  <blockquote class="reply-preview">
    <strong>{{ reply.sender_name || 'Участник' }}</strong>
    <span>{{ reply.deleted ? 'Сообщение удалено' : reply.body_preview || 'Вложение' }}</span>
    <button v-if="removable" type="button" aria-label="Отменить ответ" @click="$emit('cancel')">×</button>
  </blockquote>
</template>
<style scoped>
.reply-preview { margin: .35rem 0; padding: .4rem .7rem; border-left: 3px solid #607b90; background: #edf2f5; display: flex; gap: .6rem; align-items: center; }
.reply-preview span { white-space: pre-wrap; overflow-wrap: anywhere; }
.reply-preview button { margin-left: auto; }
</style>
