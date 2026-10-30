<script setup lang="ts">
import type { EventItem } from '~/composables/useEvents'
import EventEditor from '~/components/calendar/EventEditor.vue'
const router = useRouter()
function saved(event: EventItem) { router.push(`/events/${encodeURIComponent(event.id)}`) }
</script>
<template><main><h1>Создать событие</h1><EventEditor @saved="saved" @cancel="router.push('/calendar')" /></main></template>
