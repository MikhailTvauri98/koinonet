<script setup lang="ts">
import type { EventItem, EventSlot } from '~/composables/useEvents'
import AttachmentList from '~/components/announcements/AttachmentList.vue'
import SlotList from './SlotList.vue'
import EventMenu from './EventMenu.vue'
import MinistryMark from '~/components/ui/MinistryMark.vue'
import { eventIcsUrl } from '~/utils/ics'
import { safeCalendarReturn } from '~/composables/useCalendarView'
import { isAssigned, ownSlots } from '~/utils/assignments'
import { ministryColorVar } from '~/utils/ministryColor'
const props = defineProps<{ event: EventItem, detail?: boolean, compact?: boolean, day?: string, returnContext?: string, disabled?: boolean, chatBusy?: boolean }>()
defineEmits<{ edit: [event: EventItem], cancel: [event: EventItem], createChat: [], assign: [slot: EventSlot], assignmentsChanged: [], manageSlot: [mode: 'new' | 'edit' | 'remove', slot?: EventSlot] }>()
const { formatDateTime, formatTime, formatDate, formatEventWhen, formatDuration, deviceZoneDiffers } = useChurchDate()
const auth = useAuthStore(), settings = useSettingsStore(), { can } = useCan()
const ministryVisible = computed(() => !!props.event.ministry && (can('ministries.view_all') || can('ministries.manage_all') || Object.hasOwn(auth.permissions.ministries, props.event.ministry.id)))
const target = computed(() => ({ path: `/events/${encodeURIComponent(props.event.id)}`, ...(props.returnContext ? { query: { return: safeCalendarReturn(props.returnContext) } } : {}) }))
const ownAssignment = computed(() => isAssigned(props.event, auth.person?.id))
const mySlots = computed(() => ownSlots(props.event, auth.person?.id))
const multiDay = computed(() => formatDate(props.event.starts_at) !== formatDate(new Date(Date.parse(props.event.ends_at) - 1).toISOString()))
const endOnDifferentDate = computed(() => formatDate(props.event.starts_at) !== formatDate(props.event.ends_at))
const singleDay = computed(() => !multiDay.value)
const zoneDiffers = computed(() => deviceZoneDiffers(props.event.starts_at))
const calendarLink = computed(() => props.event.status !== 'cancelled')
const icsUrl = computed(() => eventIcsUrl(props.event.id))
const chatHref = computed(() => `/chats/${encodeURIComponent(props.event.chat_id ?? '')}`)
const hasDetails = computed(() => props.event.visibility !== 'church' || props.event.attachments.length > 0)
const dayTime = computed(() => {
  if (!props.day || !multiDay.value) return formatTime(props.event.starts_at)
  const iso = new Intl.DateTimeFormat('sv-SE', { timeZone: useSettingsStore().timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const start = iso.format(new Date(props.event.starts_at)), end = iso.format(new Date(Date.parse(props.event.ends_at) - 1))
  return props.day > start ? props.day === end ? `До ${formatTime(props.event.ends_at)}` : 'Продолжается' : `${formatTime(props.event.starts_at)} · начало`
})
</script>

<template>
  <article v-if="compact && !detail" class="event-row" :class="{ 'is-cancelled': event.status === 'cancelled' }" :style="{ '--stripe': ministryColorVar(event.ministry) }">
    <div class="event-row__time"><time :datetime="event.starts_at">{{ dayTime }}</time><small v-if="endOnDifferentDate">{{ formatDate(event.starts_at) }} — {{ formatDate(event.ends_at) }}, {{ formatTime(event.ends_at) }}</small><small v-else>{{ formatTime(event.ends_at) }}</small></div>
    <div class="event-row__content"><h3><NuxtLink class="event-row__link" :to="target">{{ event.title }}</NuxtLink></h3><p v-if="event.status === 'cancelled'" :data-test="`cancelled-${event.id}`" class="event-row__cancelled">Отменено<span v-if="event.cancel_reason">: {{ event.cancel_reason }}</span></p><p>{{ event.location }}<span v-if="event.location"> · </span>{{ event.ministry?.name || 'Церковь' }}</p><span v-if="ownAssignment" class="event-row__mine">Вы</span></div>
  </article>
  <article v-else-if="detail" class="event-card event-card--detail">
    <header class="event-head">
      <div class="event-head__top">
        <NuxtLink v-if="event.ministry && ministryVisible" class="event-head__owner" :to="`/ministries/${encodeURIComponent(event.ministry.id)}`"><MinistryMark :ministry="event.ministry" /></NuxtLink>
        <MinistryMark v-else class="event-head__owner" :ministry="event.ministry" />
        <div class="event-head__actions">
          <button v-if="event.can_manage" type="button" class="ui-button" data-test="edit-event" :disabled="disabled" @click="$emit('edit', event)">Изменить</button>
          <EventMenu :event="event" :disabled="disabled" :busy="chatBusy" @cancel="$emit('cancel', event)" @create-chat="$emit('createChat')" />
        </div>
      </div>
      <p v-if="event.status === 'cancelled'" :data-test="`cancelled-${event.id}`" class="cancelled">Отменено<span v-if="event.cancel_reason">: {{ event.cancel_reason }}</span></p>
      <h1 data-test="event-detail-heading" tabindex="-1">{{ event.title }}</h1>
      <p class="event-head__when"><time :datetime="event.starts_at">{{ formatEventWhen(event.starts_at, event.ends_at) }}</time><template v-if="singleDay"> · {{ formatDuration(event.starts_at, event.ends_at) }}</template></p>
      <p v-if="zoneDiffers" class="event-head__zone">Время церкви · {{ settings.timezone }}</p>
      <p v-if="event.location" class="event-head__place">{{ event.location }}</p>
      <p v-if="!ownAssignment && (calendarLink || (event.chat_id && event.can_manage))" class="event-head__links"><NuxtLink v-if="event.chat_id && event.can_manage" class="ui-button ui-button--quiet" data-test="open-chat" :to="chatHref">Чат события</NuxtLink><a v-if="calendarLink" class="ui-button ui-button--quiet" data-test="add-to-calendar" :href="icsUrl" download>В календарь</a></p>
    </header>
    <section v-if="ownAssignment" data-test="my-participation" aria-label="Моё участие" class="event-participation ui-surface-accent">
      <p class="event-participation__text"><strong>Вы служите:</strong> {{ mySlots.map(slot => slot.label).join(', ') }}<template v-if="event.status === 'cancelled'"> · событие отменено</template></p>
      <p v-if="event.chat_id || calendarLink" class="event-participation__actions"><NuxtLink v-if="event.chat_id" class="ui-button" data-test="open-chat" :to="chatHref">Чат события</NuxtLink><a v-if="calendarLink" class="ui-button" data-test="add-to-calendar" :href="icsUrl" download>В календарь</a></p>
    </section>
    <div class="event-detail-grid" :class="{ 'event-detail-grid--single': !hasDetails }">
      <section class="event-detail-panel" aria-label="О событии">
        <template v-if="event.description"><h2 class="event-description-heading">Описание</h2><p class="description">{{ event.description }}</p></template>
        <SlotList :slots="event.slots" :can-manage="event.can_manage && event.status === 'scheduled'" :disabled="disabled" @assign="$emit('assign', $event)" @changed="$emit('assignmentsChanged')" @manage="(mode, slot) => $emit('manageSlot', mode, slot)" />
      </section>
      <aside v-if="hasDetails" class="event-detail-panel" aria-label="Подробности события">
        <dl v-if="event.visibility !== 'church'"><dt>Видимость</dt><dd>{{ event.visibility === 'ministry' ? 'Служение' : 'Только назначенные' }}</dd></dl>
        <template v-if="event.attachments.length"><h2 class="event-attachments-heading">Вложения</h2><AttachmentList :attachments="event.attachments" /></template>
      </aside>
    </div>
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
.event-card--detail { padding: 0; background: transparent; border: 0; box-shadow: none; }
.event-head { display: grid; gap: var(--ui-space-2); margin-bottom: var(--ui-space-4); min-width: 0; }
.event-head__top { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--ui-space-2); }
.event-head__owner { min-width: 0; text-decoration: none; }
.event-head__actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ui-space-2); margin-inline-start: auto; }
.event-head h1 { margin: 0; }
.event-head p { margin: 0; }
.event-head .cancelled { margin-block: var(--ui-space-2); }
.event-head__when { color: var(--ui-text); font-size: 1rem; font-weight: 600; font-variant-numeric: tabular-nums; }
.event-head__zone { font-size: .875rem; }
.event-head__place { color: var(--ui-text); }
.event-head__links { display: flex; flex-wrap: wrap; gap: var(--ui-space-2); }
.event-participation { display: grid; gap: var(--ui-space-3); padding: var(--ui-space-4); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); margin-bottom: var(--ui-space-4); }
.event-participation p { margin: 0; color: var(--ui-text); }
.event-participation strong { color: var(--ui-accent); }
.event-participation__actions { display: flex; flex-wrap: wrap; gap: var(--ui-space-2); }
.event-detail-grid { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); align-items: start; gap: var(--ui-space-6); }
.event-detail-grid--single { grid-template-columns: minmax(0, 1fr); }
.event-detail-panel { min-width: 0; border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); background: var(--ui-surface); padding: min(var(--ui-space-6), 24px); }
.event-detail-panel h2 { margin: 0 0 var(--ui-space-4); font-size: 1.25rem; }
.event-detail-panel dl { margin: 0 0 var(--ui-space-6); }
.event-detail-panel dt { color: var(--ui-text-muted); font-size: .875rem; }
.event-detail-panel dd { margin: var(--ui-space-2) 0 0; }
.event-detail-panel .event-description-heading, .event-detail-panel .event-attachments-heading { font-size: .875rem; color: var(--ui-text-muted); font-weight: 400; margin-bottom: var(--ui-space-2); }
.description { margin-top: 0; margin-bottom: var(--ui-space-6); }
@media (max-width: 1050px) { .event-detail-grid { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 767px) {
  .event-card--detail { padding-inline: 0; border: 0; box-shadow: none; }
  .event-detail-panel { padding: 16px 12px; }
  .event-participation { padding: 16px 12px; }
}
.event-row { position: relative; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--ui-space-4); min-height: 56px; padding: var(--ui-space-2) var(--ui-space-4) var(--ui-space-2) var(--ui-space-3); border-bottom: 1px solid var(--ui-border); border-inline-start: 4px solid var(--stripe, var(--ui-ministry-church)); min-width: 0; overflow-wrap: anywhere; }
.event-row:last-child { border-bottom: 0; }
.event-row__time { display: grid; align-content: start; gap: 2px; max-width: 7rem; padding-top: 10px; font-variant-numeric: tabular-nums; }
.event-row__time small { color: var(--ui-text-muted); font-size: .875rem; }
.event-row h3 { font-size: 1rem; margin: 0; }
.event-row h3 a { display: block; min-height: 44px; padding-block: 10px 0; }
/* Растянутая ссылка: вся строка кликабельна, ссылка в строке одна. */
.event-row__link::after { content: ''; position: absolute; inset: 0; }
.event-row:focus-within { outline: 2px solid var(--ui-accent); outline-offset: -2px; }
.event-row__link:focus-visible { outline: none; }
.event-row p { font-size: .875rem; margin: 0; }
.event-row p + p { margin-top: 2px; }
.event-row .event-row__cancelled { color: var(--ui-danger); font-weight: 600; }
.event-row.is-cancelled h3 a, .event-row.is-cancelled .event-row__time time { text-decoration: line-through; color: var(--ui-text-muted); }
.event-row.is-cancelled { border-inline-start-color: var(--ui-text-muted); }
.event-row__mine { display: inline-block; background: var(--ui-accent-soft); color: var(--ui-accent); padding: 2px 10px; border-radius: 999px; margin-top: 4px; font-size: .875rem; font-weight: 600; }
@container (max-width: 18rem) { .event-row { grid-template-columns: minmax(0, 1fr); gap: var(--ui-space-2); } .event-row__time { display: flex; flex-wrap: wrap; gap: var(--ui-space-2); max-width: none; } }
</style>
