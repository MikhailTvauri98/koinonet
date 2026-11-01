<script setup lang="ts">
import type { ChatListItem } from '~/stores/chats'
import EmptyState from '~/components/ui/EmptyState.vue'
import ChatListItemComponent from './ChatListItem.vue'
withDefaults(defineProps<{ chats: ChatListItem[], showEmpty?: boolean }>(), { showEmpty: true })
const { can } = useCan()
const emptyDescription = computed(() => can('chats.create_groups') ? 'Создайте группу кнопкой «Новая группа» или дождитесь добавления в чат служения или события.' : can('chats.dm') && can('people.view') ? 'Откройте карточку человека в справочнике, чтобы начать личный чат.' : 'Здесь появятся чаты ваших служений и событий, а также группы, в которые вас добавят.')
</script>

<template>
  <ul v-if="chats.length" class="chat-list">
    <ChatListItemComponent v-for="chat in chats" :key="chat.id" :chat="chat" />
  </ul>
  <EmptyState v-else-if="showEmpty" title="Чатов пока нет." :description="emptyDescription" />
</template>

<style scoped>
.chat-list { list-style: none; padding: 0; margin: 0; }
</style>
