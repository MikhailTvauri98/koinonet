<script setup lang="ts">
import type { EventItem } from '~/composables/useEvents'
import { isCalendarDate, safeCalendarReturn } from '~/composables/useCalendarView'
import EventEditor from '~/components/calendar/EventEditor.vue'
import PageHeader from '~/components/ui/PageHeader.vue'
const route = useRoute(), router = useRouter()
const initialDate = computed(() => isCalendarDate(route.query.date) ? route.query.date : undefined)
const returnTo = computed(() => safeCalendarReturn(route.query.return))
const defaultOwner = computed(() => typeof route.query.ministry === 'string' && /^[A-Za-z0-9_-]+$/.test(route.query.ministry) ? { type: 'ministry' as const, ministryId: route.query.ministry } : undefined)
function saved(event: EventItem) { void router.push({ path: `/events/${encodeURIComponent(event.id)}`, query: { return: returnTo.value } }) }
</script>
<template>
  <main>
    <PageHeader title="Новое событие" description="Название, дата и время — всё, что нужно для начала.">
      <template #breadcrumbs><NuxtLink :to="returnTo">К календарю</NuxtLink></template>
    </PageHeader>
    <EventEditor :initial-date="initialDate" :default-owner="defaultOwner" @saved="saved" @cancel="router.push(returnTo)" />
  </main>
</template>
