<script setup lang="ts">
import type { EventItem, EventSlot } from '~/composables/useEvents'
import AttachmentList from '~/components/announcements/AttachmentList.vue'
import SlotList from './SlotList.vue'
const props = defineProps<{ event: EventItem, detail?: boolean }>()
defineEmits<{ edit: [event: EventItem], cancel: [event: EventItem], assign: [slot: EventSlot], assignmentsChanged: [] }>()
const { formatDateTime } = useChurchDate()
const auth = useAuthStore(), { can } = useCan()
const ministryVisible = computed(() => !!props.event.ministry && (can('ministries.view_all') || can('ministries.manage_all') || Object.hasOwn(auth.permissions.ministries, props.event.ministry.id)))
</script>

<template>
  <article class="event-card" :class="{ 'event-card--detail': detail }">
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
</style>
