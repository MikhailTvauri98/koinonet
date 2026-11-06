<script setup lang="ts">
import type { ChatMessage } from '~/composables/useChatMessages'
import ReplyPreview from './ReplyPreview.vue'
import MessageActions from './MessageActions.vue'
const props = defineProps<{ message: ChatMessage, own: boolean, writable: boolean, moderate: boolean, pinned: boolean }>()

defineEmits<{ reply: [message: ChatMessage], edit: [message: ChatMessage], delete: [message: ChatMessage], pin: [message: ChatMessage] }>()
const sender = computed(() => props.message.sender ? props.message.sender.person?.full_name || 'Участник' : 'Удалённый человек')
const { formatDateTime } = useChurchDate()
</script>
<template>
  <article class="message" :data-message-id="message.id" :class="{ own }" :aria-label="own ? 'Ваше сообщение' : `Сообщение: ${sender}`">
    <div class="message-heading">
      <strong v-if="!own">{{ sender }}</strong>
      <MessageActions :message="message" :own="own" :writable="writable" :moderate="moderate" :pinned="pinned" @reply="$emit('reply', $event)" @edit="$emit('edit', $event)" @delete="$emit('delete', $event)" @pin="$emit('pin', $event)" />
    </div>
    <div class="message-content">
      <template v-if="!message.deleted">
        <ReplyPreview v-if="message.reply_to" :reply="message.reply_to" />
        <p v-if="message.body" class="body">{{ message.body }}</p>
        <ul v-if="message.attachments.length" class="attachments" aria-label="Вложения сообщения">
          <li v-for="file in message.attachments" :key="file.id">
            <a :href="file.url" target="_blank" rel="noopener noreferrer">
              <img v-if="file.kind === 'image'" :src="file.thumb_url || file.url" alt="Вложение">
              <span v-else class="message-file"><span aria-hidden="true">↗</span> Открыть вложение</span>
            </a>
          </li>
        </ul>
      </template>
      <p v-else class="message-deleted"><em>Сообщение удалено</em></p>
    </div>
    <footer class="message-metadata">
      <span v-if="!message.deleted && message.edited_at" class="message-edited">Изменено</span>
      <time :datetime="message.created_at">{{ formatDateTime(message.created_at) }}</time>
    </footer>
  </article>
</template>
<style scoped>
.message { display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: .5rem; width: fit-content; max-width: min(42rem, 92%); min-width: 0; margin: .75rem 0; padding: .5rem .75rem; background: var(--ui-surface-muted); border-radius: .875rem .875rem .875rem .25rem; overflow-wrap: anywhere; }
.message-heading { display: contents; }
.message-heading > strong { grid-column: 1; grid-row: 1; align-self: center; min-width: 0; color: var(--ui-accent); font-size: .875rem; font-weight: 600; }
.message-heading > :deep(.message-actions-trigger) { grid-column: 2; grid-row: 1; align-self: start; }
.message-content { grid-column: 1 / -1; min-width: 0; }
.own { margin-left: auto; background: var(--ui-accent-soft); border-radius: .875rem .875rem .25rem .875rem; }
.own .message-content { grid-column: 1; grid-row: 1; align-self: center; }
.body, .message-deleted { white-space: pre-wrap; overflow-wrap: anywhere; margin: .25rem 0; }
.message-deleted { color: var(--ui-text-muted); }
.message-metadata { grid-column: 1 / -1; display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: .25rem .5rem; margin-top: .25rem; color: var(--ui-text-muted); font-size: .875rem; line-height: 1.5; }
.attachments { list-style: none; padding: 0; margin: .5rem 0; display: flex; flex-wrap: wrap; gap: .5rem; }
.attachments li { min-width: 0; max-width: 100%; }
.attachments a { display: block; max-width: 100%; border-radius: .5rem; }
.attachments img { display: block; max-width: min(20rem, 100%); max-height: 18rem; object-fit: contain; border-radius: .5rem; }
.message-file { display: flex; gap: .5rem; align-items: center; min-height: 44px; padding: .5rem .75rem; border: 1px solid var(--ui-border-strong); border-radius: .5rem; }
@media (max-width: 767px) {
  .message { padding-inline: 10px; max-width: 96%; }
}
</style>
