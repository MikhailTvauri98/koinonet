<script setup lang="ts">
import ChatWorkspace from '~/components/chat/ChatWorkspace.vue'
import ChatScreen from '~/components/chat/ChatScreen.vue'
definePageMeta({ chatLayout: true })
const route = useRoute()
const chatId = computed(() => String(route.params.id))
</script>
<template>
  <ChatWorkspace :selected-id="chatId"><ChatScreen :chat-id="chatId" /></ChatWorkspace>
</template>
