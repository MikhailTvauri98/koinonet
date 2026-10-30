<script setup lang="ts">
import type { EventItem } from '~/composables/useEvents'
import { addCalendarDays } from '~/composables/useEvents'
import { apiErrorMessage } from '~/utils/apiError'
import EventCard from './EventCard.vue'
const { load: loadEvents } = useEvents(), { todayInChurch } = useChurchDate()
const auth = useAuthStore(), settings = useSettingsStore()
const items = ref<EventItem[]>([]), errorMessage = ref(''), loading = ref(false)
let generation = 0
async function load() {
  const current = ++generation, session = auth.sessionVersion
  loading.value = true; items.value = []; errorMessage.value = ''
  try {
    await settings.fetch()
    if (current !== generation || session !== auth.sessionVersion) return
    const now = Date.now(), from = todayInChurch()
    const result = await loadEvents({ from, to: addCalendarDays(from, 13) }, 'mine')
    if (current === generation && session === auth.sessionVersion) items.value = result.filter(event => Date.parse(event.starts_at) >= now).slice(0, 5)
  } catch (error) {
    if (current === generation && session === auth.sessionVersion) errorMessage.value = apiErrorMessage(error, 'Не удалось загрузить ближайшие события.')
  } finally { if (current === generation && session === auth.sessionVersion) loading.value = false }
}
watch(() => auth.sessionVersion, () => { generation++; items.value = []; errorMessage.value = ''; loading.value = false })
watch(() => settings.timezone, () => { if (settings.loaded) void load() })
onBeforeUnmount(() => { generation++ })
await load()
</script>

<template>
  <section aria-label="Ближайшие мои события">
    <h2>Ближайшие мои события</h2>
    <p v-if="loading" role="status">Загружаем события…</p>
    <p v-else-if="errorMessage" role="alert">{{ errorMessage }} <button type="button" @click="load">Повторить</button></p>
    <template v-else>
      <div class="upcoming-events"><EventCard v-for="item in items" :key="item.id" :event="item" /></div>
      <p v-if="!items.length">Ближайших событий пока нет.</p>
    </template>
    <NuxtLink to="/calendar">Календарь</NuxtLink>
  </section>
</template>

<style scoped>
.upcoming-events { display: grid; gap: 0.75rem; }
[role='alert'] { color: #a32020; }
</style>
