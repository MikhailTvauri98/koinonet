<script setup lang="ts">
import type { EventItem, EventSlot } from '~/composables/useEvents'
import AttachmentList from '~/components/announcements/AttachmentList.vue'
import SlotList from './SlotList.vue'
import { safeCalendarReturn } from '~/composables/useCalendarView'
const props = defineProps<{ event: EventItem, detail?: boolean, compact?: boolean, day?: string, returnContext?: string }>()
defineEmits<{ edit: [event: EventItem], cancel: [event: EventItem], assign: [slot: EventSlot], assignmentsChanged: [] }>()
const { formatDateTime, formatTime, formatDate } = useChurchDate()
const auth = useAuthStore(), { can } = useCan()
const ministryVisible = computed(() => !!props.event.ministry && (can('ministries.view_all') || can('ministries.manage_all') || Object.hasOwn(auth.permissions.ministries, props.event.ministry.id)))
const target = computed(() => ({ path: `/events/${encodeURIComponent(props.event.id)}`, ...(props.returnContext ? { query: { return: safeCalendarReturn(props.returnContext) } } : {}) }))
const ownAssignment = computed(() => !!auth.person?.id && props.event.slots.some(slot => slot.assignments.some(assignment => assignment.person.id === auth.person!.id)))
const multiDay = computed(() => formatDate(props.event.starts_at) !== formatDate(new Date(Date.parse(props.event.ends_at) - 1).toISOString()))
const endOnDifferentDate = computed(() => formatDate(props.event.starts_at) !== formatDate(props.event.ends_at))
const dayTime = computed(() => {
  if (!props.day || !multiDay.value) return formatTime(props.event.starts_at)
  const iso = new Intl.DateTimeFormat('sv-SE', { timeZone: useSettingsStore().timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const start = iso.format(new Date(props.event.starts_at)), end = iso.format(new Date(Date.parse(props.event.ends_at) - 1))
  return props.day > start ? props.day === end ? `До ${formatTime(props.event.ends_at)}` : 'Продолжается' : `${formatTime(props.event.starts_at)} · начало`
})
</script>

<template>
  <article v-if="compact && !detail" class="event-row">
    <div class="event-row__time"><time :datetime="event.starts_at">{{ dayTime }}</time><small v-if="endOnDifferentDate">{{ formatDate(event.starts_at) }} — {{ formatDate(event.ends_at) }}, {{ formatTime(event.ends_at) }}</small><small v-else>{{ formatTime(event.ends_at) }}</small></div>
    <div class="event-row__content"><h3><NuxtLink :to="target">{{ event.title }}</NuxtLink></h3><p v-if="event.status === 'cancelled'" :data-test="`cancelled-${event.id}`" class="event-row__cancelled">Отменено<span v-if="event.cancel_reason">: {{ event.cancel_reason }}</span></p><p>{{ event.location }}<span v-if="event.location"> · </span>{{ event.ministry?.name || 'Церковь' }}</p><span v-if="ownAssignment" class="event-row__mine">Вы назначены</span></div>
  </article>
  <article v-else class="event-card" :class="{ 'event-card--detail': detail }">
    <h1 v-if="detail">{{ event.title }}</h1>
    <h3 v-else><NuxtLink :to="`/events/${encodeURIComponent(event.id)}`">{{ event.title }}</NuxtLink></h3>
    <p v-if="event.status === 'cancelled'" :data-test="`cancelled-${event.id}`" class="cancelled">Отменено<span v-if="event.cancel_reason">: {{ event.cancel_reason }}</span></p>
    <p><time :datetime="event.starts_at">{{ formatDateTime(event.starts_at) }}</time> — <time :datetime="event.ends_at">{{ formatDateTime(event.ends_at) }}</time></p>
    <p v-if="event.location">Место: {{ event.location }}</p>
    <p v-if="event.ministry">
      <NuxtLink v-if="ministryVisible" :to="`/ministries/${encodeURIComponent(event.ministry.id)}`">{{ event.ministry.name }}</NuxtLink>
      <span v-else>{{ event.ministry.name }}</span>
    </p>
    <p v-else>Церковь</p>
    <template v-if="detail">
      <p v-if="event.description" class="description">{{ event.description }}</p>
      <AttachmentList :attachments="event.attachments" />
      <div v-if="event.can_manage" class="actions">
        <button type="button" data-test="edit-event" @click="$emit('edit', event)">Изменить</button>
        <button v-if="event.status !== 'cancelled'" type="button" data-test="cancel-event" @click="$emit('cancel', event)">Отменить</button>
      </div>
      <SlotList :slots="event.slots" @assign="$emit('assign', $event)" @changed="$emit('assignmentsChanged')" />
    </template>
  </article>
</template>

<style scoped>
.event-card { min-width: 0; background: var(--ui-surface); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); box-shadow: var(--ui-shadow); padding: min(var(--ui-space-6), 24px) min(var(--ui-space-4), 16px); overflow-wrap: anywhere; }
h1, h3 { margin: 0 0 var(--ui-space-3); }
h3 a { text-decoration: none; }
h3 a:hover { text-decoration: underline; }
p { color: var(--ui-text-muted); }
.cancelled { color: var(--ui-danger); font-weight: 600; background: var(--ui-surface-muted); padding: min(var(--ui-space-2), 8px) min(var(--ui-space-3), 12px); border-radius: var(--ui-radius-sm); }
.description { white-space: pre-wrap; color: var(--ui-text); }
.actions { display: flex; flex-wrap: wrap; gap: var(--ui-space-2); margin-block: var(--ui-space-4); }
.actions button { max-width: 100%; }
@media (max-width: 767px) {
  .event-card--detail { padding-inline: 0; border: 0; box-shadow: none; }
}
.event-row { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--ui-space-4); padding: var(--ui-space-4); border-bottom: 1px solid var(--ui-border); min-width: 0; overflow-wrap: anywhere; }
.event-row:last-child { border-bottom: 0; }
.event-row__time { display: grid; align-content: start; gap: 4px; max-width: 7rem; font-variant-numeric: tabular-nums; }
.event-row__time small { color: var(--ui-text-muted); font-size: .875rem; }
.event-row h3 { font-size: 1rem; margin: 0; }
.event-row h3 a { display: block; min-height: 44px; padding-block: 8px; }
.event-row p { font-size: .875rem; margin: 4px 0 0; }
.event-row .event-row__cancelled { color: var(--ui-danger); }
.event-row__mine { display: inline-block; background: var(--ui-accent-soft); color: var(--ui-accent); padding: 4px 8px; border-radius: var(--ui-radius-sm); margin-top: 8px; font-size: .875rem; }
@container (max-width: 18rem) { .event-row { grid-template-columns: minmax(0, 1fr); gap: var(--ui-space-2); } .event-row__time { display: flex; flex-wrap: wrap; gap: var(--ui-space-2); max-width: none; } }
</style>
