<script setup lang="ts">
import type { EventItem, EventSlot } from '~/composables/useEvents'
import AttachmentList from '~/components/announcements/AttachmentList.vue'
import SlotList from './SlotList.vue'
import PageHeader from '~/components/ui/PageHeader.vue'
import { safeCalendarReturn } from '~/composables/useCalendarView'
const props = defineProps<{ event: EventItem, detail?: boolean, compact?: boolean, day?: string, returnContext?: string, disabled?: boolean }>()
defineEmits<{ edit: [event: EventItem], cancel: [event: EventItem], assign: [slot: EventSlot], assignmentsChanged: [], manageSlot: [mode: 'new' | 'edit' | 'remove', slot?: EventSlot] }>()
const { formatDateTime, formatTime, formatDate } = useChurchDate()
const auth = useAuthStore(), settings = useSettingsStore(), { can } = useCan()
const ministryVisible = computed(() => !!props.event.ministry && (can('ministries.view_all') || can('ministries.manage_all') || Object.hasOwn(auth.permissions.ministries, props.event.ministry.id)))
const target = computed(() => ({ path: `/events/${encodeURIComponent(props.event.id)}`, ...(props.returnContext ? { query: { return: safeCalendarReturn(props.returnContext) } } : {}) }))
const ownAssignment = computed(() => !!auth.person?.id && props.event.slots.some(slot => slot.assignments.some(assignment => assignment.person.id === auth.person!.id)))
const ownSlots = computed(() => props.event.slots.filter(slot => !!auth.person?.id && slot.assignments.some(assignment => assignment.person.id === auth.person!.id)))
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
  <article v-else-if="detail" class="event-card event-card--detail">
    <PageHeader data-test="event-detail-heading" tabindex="-1" :title="event.title" :description="event.ministry?.name || 'Церковь'">
      <template v-if="event.can_manage" #actions><button type="button" class="ui-button" data-test="edit-event" :disabled="disabled" @click="$emit('edit', event)">Изменить</button></template>
    </PageHeader>
    <p v-if="event.status === 'cancelled'" :data-test="`cancelled-${event.id}`" class="cancelled">Отменено<span v-if="event.cancel_reason">: {{ event.cancel_reason }}</span></p>
    <section v-if="ownAssignment" data-test="my-participation" aria-label="Моё участие" class="event-participation"><strong>Вы назначены{{ event.status === 'cancelled' ? ' · событие отменено' : '' }}</strong><ul><li v-for="slot in ownSlots" :key="slot.id">{{ slot.label }}</li></ul></section>
    <div class="event-detail-grid">
      <section class="event-detail-panel" aria-label="О событии">
        <h2>О событии</h2>
        <dl><dt>Дата и время · {{ settings.timezone }}</dt><dd><time :datetime="event.starts_at">{{ formatDateTime(event.starts_at) }}</time> — <time :datetime="event.ends_at">{{ formatDateTime(event.ends_at) }}</time></dd><dt>Место</dt><dd>{{ event.location || 'Не указано' }}</dd><dt>Владелец события</dt><dd><NuxtLink v-if="event.ministry && ministryVisible" :to="`/ministries/${encodeURIComponent(event.ministry.id)}`">{{ event.ministry.name }}</NuxtLink><span v-else>{{ event.ministry?.name || 'Церковь' }}</span></dd></dl>
        <h2 v-if="event.description" class="event-description-heading">Описание</h2><p v-if="event.description" class="description">{{ event.description }}</p>
        <SlotList :slots="event.slots" :can-manage="event.can_manage && event.status === 'scheduled'" :disabled="disabled" @assign="$emit('assign', $event)" @changed="$emit('assignmentsChanged')" @manage="(mode, slot) => $emit('manageSlot', mode, slot)" />
      </section>
      <aside class="event-detail-panel" aria-label="Подробности события"><h2>Подробности</h2><dl><dt>Видимость</dt><dd>{{ event.visibility === 'church' ? 'Вся церковь' : event.visibility === 'ministry' ? 'Служение' : 'Только назначенные' }}</dd></dl><h2 class="event-attachments-heading">Вложения</h2><AttachmentList :attachments="event.attachments" /><p v-if="!event.attachments.length" class="ui-hint">Вложений нет.</p><div v-if="$slots.actions" class="actions"><slot name="actions" /></div></aside>
    </div>
    <div v-if="event.can_manage && event.status !== 'cancelled'" class="event-danger-zone"><button type="button" class="ui-button ui-button--danger" data-test="cancel-event" :disabled="disabled" @click="$emit('cancel', event)">Отменить событие</button></div>
  </article>
  <article v-else class="event-card">
    <h3><NuxtLink :to="`/events/${encodeURIComponent(event.id)}`">{{ event.title }}</NuxtLink></h3>
    <p v-if="event.status === 'cancelled'" :data-test="`cancelled-${event.id}`" class="cancelled">Отменено<span v-if="event.cancel_reason">: {{ event.cancel_reason }}</span></p>
    <p><time :datetime="event.starts_at">{{ formatDateTime(event.starts_at) }}</time> — <time :datetime="event.ends_at">{{ formatDateTime(event.ends_at) }}</time></p>
    <p v-if="event.location">Место: {{ event.location }}</p>
    <p v-if="event.ministry">
      <NuxtLink v-if="ministryVisible" :to="`/ministries/${encodeURIComponent(event.ministry.id)}`">{{ event.ministry.name }}</NuxtLink>
      <span v-else>{{ event.ministry.name }}</span>
    </p>
    <p v-else>Церковь</p>
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
.event-card--detail { padding: 0; background: transparent; border: 0; box-shadow: none; }
.event-participation { padding: var(--ui-space-4) var(--ui-space-6); background: var(--ui-accent-soft); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); margin-bottom: var(--ui-space-6); }
.event-participation strong { color: var(--ui-accent); }
.event-participation ul { list-style: none; margin: var(--ui-space-2) 0 0; padding: 0; }
.event-detail-grid { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); align-items: start; gap: var(--ui-space-6); }
.event-detail-panel { min-width: 0; border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); background: var(--ui-surface); padding: min(var(--ui-space-6), 24px); }
.event-detail-panel h2 { margin: 0 0 var(--ui-space-4); font-size: 1.25rem; }
.event-detail-panel dl { margin: 0 0 var(--ui-space-6); }
.event-detail-panel dt { color: var(--ui-text-muted); font-size: .875rem; margin-top: var(--ui-space-4); }
.event-detail-panel dd { margin: var(--ui-space-2) 0 0; }
.event-detail-panel .event-description-heading, .event-detail-panel .event-attachments-heading { font-size: .875rem; color: var(--ui-text-muted); font-weight: 400; margin-bottom: var(--ui-space-2); }
.description { margin-top: 0; margin-bottom: var(--ui-space-6); }
.event-danger-zone { margin-top: var(--ui-space-6); }
@media (max-width: 1050px) { .event-detail-grid { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 767px) {
  .event-card--detail { padding-inline: 0; border: 0; box-shadow: none; }
  .event-detail-panel { padding: 16px 12px; }
  .event-participation { padding: 16px 12px; }
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
