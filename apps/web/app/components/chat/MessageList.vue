<script setup lang="ts">
import type { ChatMessage } from '~/composables/useChatMessages'
import MessageItem from './MessageItem.vue'
const props = defineProps<{ messages: ChatMessage[], hasOlder: boolean, loadingOlder: boolean, userId?: string, writable: boolean, moderate: boolean, pinnedIds: string[] }>()
const emit = defineEmits<{ older: [], visible: [id: string, visible: boolean], reply: [message: ChatMessage], edit: [message: ChatMessage], delete: [message: ChatMessage], pin: [message: ChatMessage] }>()
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
  <div ref="scroll" class="message-list" aria-label="История сообщений" @scroll="measure">
    <div ref="top"><button v-if="hasOlder" type="button" :disabled="loadingOlder" @click="loadOlder">{{ loadingOlder ? 'Загрузка…' : 'Ранее' }}</button></div>
    <p v-if="!messages.length">Пока нет сообщений</p>
    <template v-for="(message, index) in messages" :key="message.id">
      <div v-if="index === messages.length - 1" :ref="el => { latest = el as HTMLElement | undefined }" data-test="latest-message">
        <MessageItem :message="message" :own="message.sender?.id === userId" :writable="writable" :moderate="moderate" :pinned="pinnedIds.includes(message.id)" @reply="emit('reply', $event)" @edit="emit('edit', $event)" @delete="emit('delete', $event)" @pin="emit('pin', $event)" />
      </div>
      <MessageItem v-else :message="message" :own="message.sender?.id === userId" :writable="writable" :moderate="moderate" :pinned="pinnedIds.includes(message.id)" @reply="emit('reply', $event)" @edit="emit('edit', $event)" @delete="emit('delete', $event)" @pin="emit('pin', $event)" />
    </template>
  </div>
</template>
<style scoped>
/* History content must not set the grid's intrinsic minimum height. */
.message-list { contain: size; flex: 1 1 0; overflow-y: auto; min-height: 0; min-width: 0; overscroll-behavior: contain; padding: .4rem; }
</style>
