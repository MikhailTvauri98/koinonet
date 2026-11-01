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
  <article class="message" :data-message-id="message.id" :class="{ own }" :aria-label="`Сообщение: ${sender}`">
    <div class="message-heading">
      <div><strong>{{ sender }}</strong>
      <time :datetime="message.created_at">{{ formatDateTime(message.created_at) }}</time></div>
      <MessageActions :message="message" :own="own" :writable="writable" :moderate="moderate" :pinned="pinned" @reply="$emit('reply', $event)" @edit="$emit('edit', $event)" @delete="$emit('delete', $event)" @pin="$emit('pin', $event)" />
    </div>
    <template v-if="!message.deleted">
      <ReplyPreview v-if="message.reply_to" :reply="message.reply_to" />
      <p class="body">{{ message.body }}</p>
      <ul v-if="message.attachments.length" class="attachments">
        <li v-for="file in message.attachments" :key="file.id">
          <a :href="file.url" target="_blank" rel="noopener noreferrer">
            <img v-if="file.kind === 'image'" :src="file.thumb_url || file.url" alt="Вложение">
            <span v-else>Открыть вложение</span>
          </a>
        </li>
      </ul>
      <small v-if="message.edited_at">Изменено</small>
    </template>
    <p v-else><em>Сообщение удалено</em></p>
  </article>
</template>
<style scoped>
.message { padding: .7rem .9rem; margin: .5rem 0; background: var(--ui-surface-muted); border-radius: .7rem; max-width: 92%; min-width: 0; overflow-wrap: anywhere; }
.message-heading { display: flex; justify-content: space-between; align-items: start; gap: .25rem; }
.message-heading > div { min-width: 0; }
.own { margin-left: auto; background: var(--ui-accent-soft); }
time { display: block; font-size: .75rem; color: var(--ui-text-muted); }
.body { white-space: pre-wrap; overflow-wrap: anywhere; margin: .4rem 0; }
.attachments { list-style: none; padding: 0; display: flex; flex-wrap: wrap; gap: .5rem; }
.attachments li { min-width: 0; }
.attachments img { max-width: min(240px, 100%); max-height: 240px; border-radius: .4rem; }
</style>
