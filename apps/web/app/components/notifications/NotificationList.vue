<script setup lang="ts">
import type { AppNotification } from '~/stores/notifications'

const props = defineProps<{ items: AppNotification[], disabled?: boolean }>()
defineEmits<{ select: [notification: AppNotification] }>()
const { formatDate, formatTime, toLocalInput } = useChurchDate()
const headingId = useId()
const groups = computed(() => {
  const days = new Map<string, { key: string, label: string, items: AppNotification[] }>()
  for (const item of props.items) {
    const key = item.created_at ? toLocalInput(item.created_at).slice(0, 10) : 'undated'
    if (!days.has(key)) days.set(key, { key, label: item.created_at ? formatDate(item.created_at) : 'Дата не указана', items: [] })
    days.get(key)!.items.push(item)
  }
  return [...days.values()]
})
function keepFocusedRowVisible(event: FocusEvent) {
  const button = event.currentTarget as HTMLButtonElement
  // Native focus scrolling can align the bottom of a row taller than the
  // viewport, hiding its title. After that scroll, reveal the row's start.
  requestAnimationFrame(() => {
    if (document.activeElement !== button) return
    const mobile = window.matchMedia('(max-width: 767px)').matches
    const navigationHeight = mobile ? Number.parseFloat(getComputedStyle(button).getPropertyValue('--app-nav-height')) || 0 : 0
    const availableBottom = window.innerHeight - navigationHeight - 16
    const box = button.getBoundingClientRect()
    if (box.top < 16 || (box.height <= availableBottom - 16 && box.bottom > availableBottom)) button.scrollIntoView({ block: 'start' })
  })
}
</script>

<template>
  <div class="notification-list">
    <section v-for="group in groups" :key="group.key" class="notification-list__group" :aria-labelledby="`${headingId}-${group.key}`">
      <h2 :id="`${headingId}-${group.key}`">{{ group.label }}</h2>
      <ul>
        <li v-for="item in group.items" :key="item.id">
          <button type="button" :data-test="`notification-${item.id}`" :class="{ unread: !item.read_at }" :disabled="disabled" @focus="keepFocusedRowVisible" @click="$emit('select', item)">
            <strong>{{ item.title }}</strong>
            <span class="notification-list__body">{{ item.body }}</span>
            <span class="notification-list__meta">
              <span v-if="!item.read_at" class="notification-list__unread">Непрочитано</span>
              <time v-if="item.created_at" :datetime="item.created_at">{{ formatTime(item.created_at) }}</time>
            </span>
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.notification-list { display: grid; gap: var(--ui-space-6); min-width: 0; }
.notification-list__group { min-width: 0; }
h2 { margin: 0 0 var(--ui-space-3); color: var(--ui-text-muted); font-size: .875rem; font-weight: 600; }
ul { list-style: none; padding: 0; margin: 0; border: 1px solid var(--ui-border); border-radius: .875rem; background: var(--ui-surface); }
li + li { border-top: 1px solid var(--ui-border); }
button { display: grid; gap: var(--ui-space-2); width: 100%; min-width: 0; padding: var(--ui-space-4); border: 0; border-radius: 0; background: transparent; text-align: left; color: var(--ui-text); scroll-margin-block: 16px calc(var(--app-nav-height, var(--ui-mobile-nav-space)) + 16px); font-weight: 400; line-height: 1.5; overflow-wrap: anywhere; }
li:first-child button { border-start-start-radius: .875rem; border-start-end-radius: .875rem; }
li:last-child button { border-end-start-radius: .875rem; border-end-end-radius: .875rem; }
button:hover:not(:disabled) { background: var(--ui-surface-muted); }
button:focus-visible { position: relative; z-index: 1; outline-offset: -3px; }
strong { font-weight: 600; }
.notification-list__body { color: var(--ui-text-muted); }
.notification-list__meta { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ui-space-3); color: var(--ui-text-muted); font-size: .875rem; }
.notification-list__unread { color: var(--ui-accent); font-weight: 600; }
.notification-list__unread::before { content: ''; display: inline-block; width: .375rem; height: .375rem; margin-inline-end: .5rem; border-radius: 50%; background: currentColor; vertical-align: middle; }
</style>
