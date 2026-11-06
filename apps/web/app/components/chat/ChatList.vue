<script setup lang="ts">
import type { ChatListItem } from '~/stores/chats'
import EmptyState from '~/components/ui/EmptyState.vue'
import ChatListItemComponent from './ChatListItem.vue'
withDefaults(defineProps<{ chats: ChatListItem[], showEmpty?: boolean, selectedId?: string }>(), { showEmpty: true, selectedId: undefined })
const { can } = useCan()
const emptyDescription = computed(() => {
  const actions = []
  if (can('people.view') && can('chats.dm')) actions.push('начните личный чат кнопкой «Новое сообщение»')
  if (can('chats.create_groups')) actions.push('создайте группу кнопкой «Новая группа»')
  return actions.length ? `Здесь появятся чаты ваших служений и событий. Также ${actions.join(' или ')}.` : 'Здесь появятся чаты ваших служений и событий, а также группы, в которые вас добавят.'
})
</script>

<template>
  <ul v-if="chats.length" class="chat-list">
    <ChatListItemComponent v-for="chat in chats" :key="chat.id" :chat="chat" :selected="chat.id === selectedId" />
  </ul>
  <EmptyState v-else-if="showEmpty" title="Чатов пока нет." :description="emptyDescription" />
</template>

<style scoped>
.chat-list { list-style: none; padding: 0; margin: 0; }
</style>
