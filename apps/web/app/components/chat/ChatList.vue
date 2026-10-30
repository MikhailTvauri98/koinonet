<script setup lang="ts">
import type { ChatListItem } from '~/stores/chats'
import ChatListItemComponent from './ChatListItem.vue'
defineProps<{ chats: ChatListItem[] }>()
</script>

<template>
  <ul v-if="chats.length" class="chat-list">
    <ChatListItemComponent v-for="chat in chats" :key="chat.id" :chat="chat" />
  </ul>
  <p v-else>Чатов пока нет.</p>
</template>

<style scoped>
.chat-list { list-style: none; padding: 0; margin: 0; }
</style>
