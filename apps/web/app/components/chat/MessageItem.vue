<script setup lang="ts">
import type { ChatMessage } from '~/composables/useChatMessages'
import ReplyPreview from './ReplyPreview.vue'
const props = defineProps<{ message: ChatMessage, own: boolean, writable: boolean, moderate: boolean, pinned: boolean }>()
defineEmits<{ reply: [message: ChatMessage], edit: [message: ChatMessage], delete: [message: ChatMessage], pin: [message: ChatMessage] }>()
const sender = computed(() => props.message.sender ? props.message.sender.person?.full_name || 'Участник' : 'Удалённый человек')
const { formatDateTime } = useChurchDate()
</script>
<template>
  <article class="message" :data-message-id="message.id" :class="{ own }" :aria-label="`Сообщение: ${sender}`">
    <strong>{{ sender }}</strong>
    <time :datetime="message.created_at">{{ formatDateTime(message.created_at) }}</time>
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
      <div class="actions">
        <button v-if="writable" type="button" :data-test="`reply-${message.id}`" @click="$emit('reply', message)">Ответить</button>
        <button v-if="own && writable" type="button" :data-test="`edit-${message.id}`" @click="$emit('edit', message)">Изменить</button>
        <button v-if="(own && writable) || moderate" type="button" :data-test="`delete-${message.id}`" @click="$emit('delete', message)">Удалить</button>
        <button v-if="moderate" type="button" @click="$emit('pin', message)">{{ pinned ? 'Открепить' : 'Закрепить' }}</button>
      </div>
    </template>
    <p v-else><em>Сообщение удалено</em></p>
  </article>
</template>
<style scoped>
.message { padding: .7rem .9rem; margin: .5rem 0; background: #f0f3f6; border-radius: .7rem; max-width: 90%; }
.own { margin-left: auto; background: #e4f0eb; }
time { display: block; font-size: .75rem; color: #4b5563; }
.body { white-space: pre-wrap; overflow-wrap: anywhere; margin: .4rem 0; }
.actions { display: flex; flex-wrap: wrap; gap: .4rem; }
.actions button { font-size: .8rem; }
.attachments { list-style: none; padding: 0; display: flex; flex-wrap: wrap; gap: .5rem; }
.attachments img { max-width: min(240px, 100%); max-height: 240px; border-radius: .4rem; }
</style>
