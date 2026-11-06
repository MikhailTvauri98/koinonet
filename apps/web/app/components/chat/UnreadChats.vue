<script setup lang="ts">
import ChatList from './ChatList.vue'
const chats = useChatsStore()
const unread = computed(() => chats.chats.filter(chat => chat.unread_count > 0).slice(0, 3))
if (!chats.loaded && !chats.loading) void chats.fetch()
</script>

<template>
  <section class="home-section home-section--chats" aria-label="Непрочитанное">
    <header class="home-section__header"><h2>Непрочитанное</h2><NuxtLink to="/chats">Все чаты</NuxtLink></header>
    <p v-if="chats.loading" role="status">Загрузка чатов…</p>
    <p v-if="chats.error || chats.connectionError" role="alert">{{ chats.error || chats.connectionError }} <button :disabled="chats.loading" @click="chats.retry()">Повторить</button></p>
    <ChatList v-if="unread.length" :chats="unread" />
    <p v-else-if="chats.loaded && !chats.loading">Непрочитанных сообщений нет.</p>
  </section>
</template>
