<script setup lang="ts">
import type { ChatListItem } from '~/stores/chats'
import { useChatMuted } from '~/composables/useChatMuted'
const props = defineProps<{ chat: ChatListItem, selected?: boolean }>()
const { formatDateTime } = useChurchDate()
const muted = useChatMuted(() => props.chat.muted_until)
const initials = computed(() => props.chat.title.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toLocaleUpperCase('ru'))
const preview = computed(() => {
  const message = props.chat.last_message
  if (!message) return 'Сообщений пока нет'
  if (message.deleted) return 'Сообщение удалено'
  return message.body_preview?.replace(/\s+/gu, ' ').trim() || 'Вложение'
})
</script>

<template>
  <li>
    <NuxtLink :to="`/chats/${chat.id}`" class="chat-item" :class="{ 'chat-item--selected': selected }" :aria-current="selected ? 'page' : undefined">
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
li { container-type: inline-size; }
.chat-item { display: flex; gap: min(.75rem, 12px); align-items: center; padding: 1rem min(.5rem, 8px); color: inherit; text-decoration: none; border-bottom: 1px solid var(--ui-border); border-radius: var(--ui-radius-sm); }
.chat-item:hover { background: var(--ui-surface-muted); }
.chat-item--selected { background: var(--ui-accent-soft); }
.chat-item--selected strong { color: var(--ui-accent); }
.chat-item:focus-visible { outline: 2px solid var(--ui-accent); outline-offset: 2px; }
.chat-item__avatar { width: min(3rem, 48px); height: min(3rem, 48px); border-radius: 50%; background: var(--ui-surface-muted); display: flex; align-items: center; justify-content: center; object-fit: cover; flex-shrink: 0; }
.chat-item__content { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.chat-item__preview { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; white-space: normal; color: var(--ui-text-muted); }
.chat-item__marker, time { font-size: .875rem; color: var(--ui-text-muted); }
.chat-item__marker { margin-inline-start: .5rem; }
.chat-item__badge { border-radius: 999px; padding: .15rem .5rem; background: var(--ui-accent); color: var(--ui-on-accent); }
@container (max-width: 18rem) {
  .chat-item { display: grid; grid-template-columns: 48px minmax(0, 1fr); align-items: start; }
  .chat-item__avatar { grid-row: 1; grid-column: 1; }
  .chat-item__content { grid-row: 2; grid-column: 1 / -1; }
  .chat-item__badge { grid-row: 1; grid-column: 2; justify-self: end; }
}
</style>
