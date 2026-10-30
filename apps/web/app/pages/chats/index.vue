<script setup lang="ts">
import ChatList from '~/components/chat/ChatList.vue'
const chats = useChatsStore()
await chats.fetch()
</script>

<template>
  <section aria-label="Чаты">
    <h1>Чаты</h1>
    <p v-if="chats.loading" role="status">Загрузка чатов…</p>
    <p v-if="chats.error || chats.connectionError" role="alert">{{ chats.error || chats.connectionError }} <button :disabled="chats.loading" @click="chats.retry()">Повторить</button></p>
    <ChatList v-if="chats.loaded || chats.chats.length" :chats="chats.chats" />
  </section>
</template>
