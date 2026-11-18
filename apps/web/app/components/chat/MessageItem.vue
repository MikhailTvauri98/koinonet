<script setup lang="ts">
import type { ChatMessage } from '~/composables/useChatMessages'
import { senderLabel } from '~/utils/messageGroups'
import ReplyPreview from './ReplyPreview.vue'
import MessageActions from './MessageActions.vue'
const props = defineProps<{ message: ChatMessage, own: boolean, first?: boolean, senderName?: string, writable: boolean, moderate: boolean, pinned: boolean }>()

defineEmits<{ reply: [message: ChatMessage], edit: [message: ChatMessage], delete: [message: ChatMessage], pin: [message: ChatMessage] }>()
const sender = computed(() => props.senderName ?? senderLabel(props.message.sender))
const { formatTime } = useChurchDate()
const actions = ref<InstanceType<typeof MessageActions>>()
// Touch devices open the actions on a 500 ms press; a move, lift or cancel aborts it.
const LONG_PRESS_MS = 500
let pressTimer: ReturnType<typeof setTimeout> | undefined
let pressed = { x: 0, y: 0 }
let suppressMenu = false
function cancelPress() { if (pressTimer) clearTimeout(pressTimer); pressTimer = undefined }
function pressStart(event: PointerEvent) {
  cancelPress()
  suppressMenu = false
  if (event.pointerType !== 'touch' || (event.target as Element | null)?.closest('a, button')) return
  pressed = { x: event.clientX, y: event.clientY }
  pressTimer = setTimeout(() => { pressTimer = undefined; suppressMenu = true; actions.value?.open() }, LONG_PRESS_MS)
}
function pressMove(event: PointerEvent) { if (pressTimer && Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > 10) cancelPress() }
// The browser's own long-press menu would cover ours.
function nativeMenu(event: Event) { if (suppressMenu) { event.preventDefault(); suppressMenu = false } }
onBeforeUnmount(cancelPress)
</script>
<template>
  <article class="message" :data-message-id="message.id" :class="{ own }" :aria-label="own ? 'Ваше сообщение' : `Сообщение: ${sender}`" @pointerdown="pressStart" @pointermove="pressMove" @pointerup="cancelPress" @pointercancel="cancelPress" @pointerleave="cancelPress" @contextmenu="nativeMenu">
    <strong v-if="first && !own" class="message-sender">{{ sender }}</strong>
    <MessageActions ref="actions" :message="message" :own="own" :writable="writable" :moderate="moderate" :pinned="pinned" @reply="$emit('reply', $event)" @edit="$emit('edit', $event)" @delete="$emit('delete', $event)" @pin="$emit('pin', $event)" />
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
      <time :datetime="message.created_at">{{ formatTime(message.created_at) }}</time>
    </footer>
  </article>
</template>
<style scoped>
.message { position: relative; width: fit-content; max-width: min(42rem, 100%); min-width: 0; margin: 0; padding: .5rem .75rem; background: var(--ui-surface-muted); border-radius: .875rem .875rem .875rem .25rem; overflow-wrap: anywhere; }
.message-sender { display: block; min-width: 0; color: var(--ui-accent); font-size: .875rem; font-weight: 600; }
.message-content { min-width: 0; }
.own { background: var(--ui-accent-soft); border-radius: .875rem .875rem .25rem .875rem; }
.body, .message-deleted { white-space: pre-wrap; overflow-wrap: anywhere; margin: .25rem 0; }
.message-deleted { color: var(--ui-text-muted); }
.message-metadata { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: .25rem .5rem; margin-top: .25rem; color: var(--ui-text-muted); font-size: .875rem; line-height: 1.5; }
.attachments { list-style: none; padding: 0; margin: .5rem 0; display: flex; flex-wrap: wrap; gap: .5rem; }
.attachments li { min-width: 0; max-width: 100%; }
.attachments a { display: block; max-width: 100%; border-radius: .5rem; }
.attachments img { display: block; max-width: min(20rem, 100%); max-height: 18rem; object-fit: contain; border-radius: .5rem; }
.message-file { display: flex; gap: .5rem; align-items: center; min-height: 44px; padding: .5rem .75rem; border: 1px solid var(--ui-border-strong); border-radius: .5rem; }
@media (max-width: 767px) {
  .message { padding-inline: 10px; }
}
</style>
