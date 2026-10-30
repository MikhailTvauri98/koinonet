<script setup lang="ts">
import ChatScreen from '~/components/chat/ChatScreen.vue'
const route = useRoute()
const chatId = computed(() => String(route.params.id))
</script>
<template>
  <ChatScreen :chat-id="chatId" />
</template>
