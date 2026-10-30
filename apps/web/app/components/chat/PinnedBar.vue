<script setup lang="ts">
import type { ChatMessage } from '~/composables/useChatMessages'
defineProps<{ messages: ChatMessage[], moderate: boolean }>()
defineEmits<{ unpin: [message: ChatMessage] }>()
</script>
<template>
  <details v-if="messages.length" data-test="pinned-bar" class="pinned-bar" open>
    <summary>Закреплённые сообщения ({{ messages.length }})</summary>
    <div v-for="message in messages" :key="message.id">
      <span>{{ message.deleted ? 'Сообщение удалено' : message.body || 'Вложение' }}</span>
      <button v-if="moderate" type="button" @click="$emit('unpin', message)">Открепить</button>
    </div>
  </details>
</template>
<style scoped>
.pinned-bar { padding: .6rem; background: #fff7df; max-height: 22vh; overflow: auto; }
.pinned-bar div { display: flex; justify-content: space-between; gap: .6rem; padding-top: .4rem; }
.pinned-bar span { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
