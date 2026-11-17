<script setup lang="ts">
import type { ChatMessage } from '~/composables/useChatMessages'
import UiAvatar from '~/components/ui/UiAvatar.vue'
import { groupMessages, senderLabel } from '~/utils/messageGroups'
import MessageItem from './MessageItem.vue'
const props = defineProps<{ messages: ChatMessage[], hasOlder: boolean, loadingOlder: boolean, userId?: string, writable: boolean, moderate: boolean, pinnedIds: string[] }>()
const emit = defineEmits<{ older: [], visible: [id: string, visible: boolean], reply: [message: ChatMessage], edit: [message: ChatMessage], delete: [message: ChatMessage], pin: [message: ChatMessage] }>()
const settings = useSettingsStore()
const { formatChatDay } = useChurchDate()
// Day separators and groups follow the church calendar, not the device's.
const items = computed(() => groupMessages(props.messages, settings.timezone, 5, props.userId))
type Row = { kind: 'day', key: string, day: string } | { kind: 'message', key: string, message: ChatMessage, own: boolean, first: boolean, senderId: string | null }
const rows = computed(() => items.value.flatMap<Row>(item => item.kind === 'day'
  ? [{ kind: 'day' as const, key: `day-${item.day}`, day: item.day }]
  : item.messages.map((message, index) => ({ kind: 'message' as const, key: message.id, message, own: item.own, first: index === 0, senderId: item.senderId }))))
const scroll = ref<HTMLElement>()
const top = ref<HTMLElement>()
const latest = ref<HTMLElement>()
let resizeObserver: ResizeObserver | undefined
let observer: IntersectionObserver | undefined
let viewportObserver: IntersectionObserver | undefined
let observerRun = 0
let previousLatest: string | undefined
let atBottom = true
let viewportHeight = 0
let restore: { id: string, offset: number } | undefined
let autoBoundary: string | undefined
function loadOlder() {
  if (props.loadingOlder || !props.hasOlder || !scroll.value) return
  const rootTop = scroll.value.getBoundingClientRect().top
  const anchor = [...scroll.value.querySelectorAll<HTMLElement>('[data-message-id]')].find(el => el.getBoundingClientRect().bottom > rootTop)
  if (anchor?.dataset.messageId) restore = { id: anchor.dataset.messageId, offset: anchor.getBoundingClientRect().top - rootTop }
  emit('older')
}
// Image decoding changes content height without resizing this scroll box.
// Follow only when the reader was already at the newest message.
function imageLoaded() {
  if (scroll.value && atBottom && !restore) scroll.value.scrollTop = scroll.value.scrollHeight
}
function measure() {
  const el = scroll.value
  // A resized viewport can dispatch scroll before ResizeObserver. Keep the
  // previous follow intent until that observer handles the new height.
  if (el && (!resizeObserver || el.clientHeight === viewportHeight)) atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60
}
async function observe() {
  const run = ++observerRun
  observer?.disconnect()
  viewportObserver?.disconnect()
  if (previousLatest) emit('visible', previousLatest, false)
  previousLatest = props.messages.at(-1)?.id
  await nextTick()
  if (run !== observerRun) return
  const el = scroll.value
  if (!el) return
  if (restore && !props.loadingOlder) {
    const anchor = [...el.querySelectorAll<HTMLElement>('[data-message-id]')].find(row => row.dataset.messageId === restore?.id)
    if (anchor) el.scrollTop += anchor.getBoundingClientRect().top - el.getBoundingClientRect().top - restore.offset
    restore = undefined
  }
  else if (!restore && atBottom) el.scrollTop = el.scrollHeight
  if (typeof IntersectionObserver === 'undefined') return
  observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const boundary = props.messages[0]?.id
      if (entry.target === top.value && entry.isIntersecting && boundary !== autoBoundary) { autoBoundary = boundary; loadOlder() }
    })
  }, { root: el, threshold: 0.6 })
  const current = previousLatest
  // A scroller-root intersection alone also reports a chat wholly below the
  // browser viewport. The viewport observer includes every ancestor clip.
  viewportObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.target === latest.value && current === props.messages.at(-1)?.id && current) {
        emit('visible', current, entry.isIntersecting && entry.intersectionRect.width > 0 && entry.intersectionRect.height > 0)
      }
    })
  }, { root: null, threshold: 0 })
  if (top.value) observer.observe(top.value)
  if (latest.value) viewportObserver.observe(latest.value)
}
watch([() => props.messages, () => props.loadingOlder], observe, { flush: 'post' })
onMounted(() => {
  void observe()
  if (typeof ResizeObserver !== 'undefined' && scroll.value) {
    viewportHeight = scroll.value.clientHeight
    resizeObserver = new ResizeObserver(() => {
      // Preserve the reader's position unless they were following the newest
      // message before a composer/header/viewport resize.
      if (scroll.value) {
        viewportHeight = scroll.value.clientHeight
        if (atBottom && !restore) scroll.value.scrollTop = scroll.value.scrollHeight
      }
    })
    resizeObserver.observe(scroll.value)
  }
})
onBeforeUnmount(() => { observerRun++; resizeObserver?.disconnect(); observer?.disconnect(); viewportObserver?.disconnect() })
</script>
<template>
  <div ref="scroll" class="message-list" aria-label="История сообщений" @scroll="measure" @load.capture="imageLoaded">
    <div ref="top"><button v-if="hasOlder" type="button" :disabled="loadingOlder" @click="loadOlder">{{ loadingOlder ? 'Загрузка…' : 'Ранее' }}</button></div>
    <p v-if="!messages.length">Пока нет сообщений</p>
    <!-- Stable keyed rows retain an open action menu when a newer row arrives.
         A former last row must not clear the newly assigned latest ref. -->
    <!-- Flat rows keyed by message id: a group that gains older messages keeps
         every existing MessageItem mounted, so the scroll anchor and open menus survive. -->
    <template v-for="row in rows" :key="row.key">
      <p v-if="row.kind === 'day'" class="message-day">{{ formatChatDay(row.day) }}</p>
      <div
        v-else :ref="el => { if (!messages.length || row.message.id === messages.at(-1)?.id) latest = (el as HTMLElement | null) ?? undefined }" class="message-row"
        :class="{ own: row.own, 'message-row--first': row.first }"
        :data-test="row.message.id === messages.at(-1)?.id ? 'latest-message' : undefined">
        <template v-if="!row.own">
          <UiAvatar v-if="row.first" :id="row.message.sender?.person?.id ?? row.senderId ?? 'deleted-person'" :name="row.message.sender?.person?.short_name ?? null" class="message-row__avatar" size="sm" decorative />
          <span v-else class="message-row__avatar" aria-hidden="true" />
        </template>
        <MessageItem :message="row.message" :own="row.own" :first="row.first" :sender-name="senderLabel(row.message.sender)" :writable="writable" :moderate="moderate" :pinned="pinnedIds.includes(row.message.id)" @reply="emit('reply', $event)" @edit="emit('edit', $event)" @delete="emit('delete', $event)" @pin="emit('pin', $event)" />
      </div>
    </template>
  </div>
</template>
<style scoped>
/* History content must not set the grid's intrinsic minimum height. */
.message-day { margin: 1rem 0 .25rem; text-align: center; color: var(--ui-text-muted); font-size: .875rem; font-weight: 600; }
.message-row { display: flex; align-items: flex-start; gap: .5rem; margin: .125rem 0; min-width: 0; }
.message-row--first { margin-top: .75rem; }
.message-row__avatar { flex: none; width: 32px; margin-top: .25rem; }
.message-row > :last-child { min-width: 0; max-width: 100%; }
/* Свои сообщения справа: даже длинный пузырь на телефоне отступает от левого края
   дальше колонки аватара чужих сообщений (32 px и промежуток). */
.message-row.own { justify-content: flex-end; padding-inline-start: 48px; }
/* Hidden actions appear with the pointer on the row or focus inside it. The
   button is out of reach (no pointer events) while invisible, but stays in the Tab order. */
@media (hover: hover) and (pointer: fine) {
  .message-row:hover :deep(.message-actions-trigger), .message-row:focus-within :deep(.message-actions-trigger) { opacity: 1; pointer-events: auto; }
}
/* Wide screens: the button sits beside the bubble in space reserved for it, never over the text. */
@media (hover: hover) and (pointer: fine) and (min-width: 768px) {
  .message-row { padding-inline-end: 3rem; }
  .message-row.own { padding-inline-end: 0; padding-inline-start: 3rem; }
  .message-row :deep(.message-actions-trigger) { inset-inline-end: auto; inset-inline-start: calc(100% + .25rem); top: 0; }
  .message-row.own :deep(.message-actions-trigger) { inset-inline-start: auto; inset-inline-end: calc(100% + .25rem); }
}
.message-list { contain: size; flex: 1 1 0; overflow-y: auto; min-height: 0; min-width: 0; overscroll-behavior: contain; padding: .4rem; }
</style>
