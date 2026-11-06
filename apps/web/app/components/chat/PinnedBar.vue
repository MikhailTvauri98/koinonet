<script setup lang="ts">
import type { ChatMessage } from '~/composables/useChatMessages'

defineProps<{ messages: ChatMessage[], moderate: boolean }>()

defineEmits<{ unpin: [message: ChatMessage] }>()
</script>
<template>
  <details v-if="messages.length" data-test="pinned-bar" class="pinned-bar" open>
    <summary>Закреплённые сообщения ({{ messages.length }})</summary>
    <div v-for="message in messages" :key="message.id" class="pinned-bar__message">
      <span>{{ message.deleted ? 'Сообщение удалено' : message.body || 'Вложение' }}</span>
      <button v-if="moderate" type="button" @click="$emit('unpin', message)">Открепить</button>
    </div>
  </details>
</template>
<style scoped>
.pinned-bar { padding: .25rem .75rem; background: var(--ui-accent-soft); border-inline-start: 3px solid var(--ui-accent); border-radius: .5rem; max-height: 22vh; overflow: auto; font-size: .875rem; }
.pinned-bar summary { min-height: 44px; align-content: center; font-weight: 600; cursor: pointer; overflow-wrap: anywhere; }
.pinned-bar__message { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .5rem; padding: .5rem 0; border-top: 1px solid var(--ui-border); }
.pinned-bar span { flex: 1 1 12rem; min-width: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.pinned-bar button { min-width: 44px; max-width: 100%; font-size: inherit; }
</style>
