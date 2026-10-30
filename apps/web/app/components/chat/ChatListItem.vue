<script setup lang="ts">
import type { ChatListItem } from '~/stores/chats'
const props = defineProps<{ chat: ChatListItem }>()
const { formatDateTime } = useChurchDate()
const muted = computed(() => props.chat.muted_until && new Date(props.chat.muted_until).getTime() > Date.now())
const initials = computed(() => props.chat.title.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toLocaleUpperCase('ru'))
const preview = computed(() => !props.chat.last_message ? 'Сообщений пока нет' : props.chat.last_message.deleted ? 'Сообщение удалено' : props.chat.last_message.body_preview || 'Вложение')
</script>

<template>
  <li>
    <NuxtLink :to="`/chats/${chat.id}`" class="chat-item">
      <img v-if="chat.avatar_url" :src="chat.avatar_url" alt="" class="chat-item__avatar">
      <span v-else class="chat-item__avatar" aria-hidden="true">{{ initials }}</span>
      <span class="chat-item__content">
        <strong>{{ chat.title }}</strong>
        <span v-if="chat.archived" class="chat-item__marker">Архив</span>
        <span v-if="muted" :data-test="`muted-${chat.id}`" class="chat-item__marker">Без звука</span>
        <span class="chat-item__preview">{{ preview }}</span>
        <time v-if="chat.last_message_at" :datetime="chat.last_message_at">{{ formatDateTime(chat.last_message_at) }}</time>
      </span>
      <span v-if="chat.unread_count" :data-test="`unread-${chat.id}`" class="chat-item__badge" :aria-label="`Непрочитанных: ${chat.unread_count}`">{{ chat.unread_count }}</span>
    </NuxtLink>
  </li>
</template>

<style scoped>
.chat-item { display: flex; gap: .75rem; align-items: center; padding: 1rem .5rem; color: inherit; text-decoration: none; border-bottom: 1px solid #ddd; }
.chat-item:focus-visible { outline: 2px solid #234e79; outline-offset: 2px; }
.chat-item__avatar { width: 3rem; height: 3rem; border-radius: 50%; background: #edf2f7; display: flex; align-items: center; justify-content: center; object-fit: cover; flex-shrink: 0; }
.chat-item__content { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.chat-item__preview { display: block; white-space: pre-line; color: #4b5563; }
.chat-item__marker, time { font-size: .85rem; color: #4b5563; }
.chat-item__marker { margin-inline-start: .5rem; }
.chat-item__badge { border-radius: 999px; padding: .15rem .5rem; background: #234e79; color: white; }
</style>
