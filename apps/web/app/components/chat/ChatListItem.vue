<script setup lang="ts">
import type { ChatListItem } from '~/stores/chats'
import { useChatMuted } from '~/composables/useChatMuted'
import UiAvatar from '~/components/ui/UiAvatar.vue'
const props = defineProps<{ chat: ChatListItem, selected?: boolean }>()
const { formatMoment } = useChurchDate()
const muted = useChatMuted(() => props.chat.muted_until)
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
      <UiAvatar :id="chat.id" :name="chat.title" :photo-url="chat.avatar_url" decorative />
      <span class="chat-item__content">
        <span class="chat-item__line">
          <strong class="chat-item__title">{{ chat.title }}</strong>
          <time v-if="chat.last_message_at" :datetime="chat.last_message_at">{{ formatMoment(chat.last_message_at) }}</time>
        </span>
        <span class="chat-item__line">
          <span class="chat-item__preview">{{ preview }}</span>
          <span v-if="chat.archived" class="chat-item__marker">Архив</span>
          <span v-if="muted" :data-test="`muted-${chat.id}`" class="chat-item__marker">Без звука</span>
          <span v-if="chat.unread_count" :data-test="`unread-${chat.id}`" class="chat-item__badge" :aria-label="`Непрочитанных: ${chat.unread_count}`">{{ chat.unread_count }}</span>
        </span>
      </span>
    </NuxtLink>
  </li>
</template>

<style scoped>
/* Строка — одна ссылка: аватар слева, две строки справа. Название и превью в одну строку с многоточием;
   при крупном тексте время и счётчик переносятся на свою строку, а не наезжают на название. */
.chat-item { display: flex; gap: 12px; align-items: center; min-height: 64px; box-sizing: border-box; padding: 10px 8px; color: inherit; text-decoration: none; border-bottom: 1px solid var(--ui-border); border-radius: var(--ui-radius-sm); }
.chat-item:hover { background: var(--ui-surface-muted); }
.chat-item--selected { background: var(--ui-accent-soft); }
.chat-item--selected .chat-item__title { color: var(--ui-accent); }
.chat-item:focus-visible { outline: 2px solid var(--ui-accent); outline-offset: 2px; }
.chat-item__content { display: grid; flex: 1; gap: 2px; min-width: 0; }
.chat-item__line { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 8px; min-width: 0; }
.chat-item__title, .chat-item__preview { flex: 1 1 6rem; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chat-item__title { line-height: 1.35; }
.chat-item__preview { color: var(--ui-text-muted); font-size: .875rem; line-height: 1.4; }
.chat-item__marker, time { flex: none; font-size: .875rem; line-height: 1.4; color: var(--ui-text-muted); }
time { margin-inline-start: auto; }
.chat-item__badge { flex: none; margin-inline-start: auto; align-self: center; min-width: 1.5rem; box-sizing: border-box; border-radius: 999px; padding: .1rem .5rem; text-align: center; font-size: .875rem; line-height: 1.4; background: var(--ui-accent); color: var(--ui-on-accent); }
</style>
