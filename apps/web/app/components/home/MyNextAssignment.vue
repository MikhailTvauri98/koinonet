<script setup lang="ts">
import type { EventItem } from '~/composables/useEvents'
import { addCalendarDays } from '~/composables/useEvents'
import { ownSlots, isAssigned } from '~/utils/assignments'
const { load: loadEvents } = useEvents(), { todayInChurch, formatEventWhen } = useChurchDate()
const auth = useAuthStore(), settings = useSettingsStore()
const next = ref<EventItem | null>(null)
let generation = 0
async function load() {
  const current = ++generation, session = auth.sessionVersion
  const active = () => current === generation && session === auth.sessionVersion
  try {
    await settings.fetch()
    if (!active()) return
    const from = todayInChurch(), now = Date.now(), personId = auth.person?.id
    const result = await loadEvents({ from, to: addCalendarDays(from, 13) }, 'mine')
    // Блок необязателен: сбой запроса не рисует ошибку, связь показывает общий индикатор.
    if (active()) next.value = result.find(event => event.status !== 'cancelled' && Date.parse(event.ends_at) > now && isAssigned(event, personId)) ?? null
  } catch { /* блока просто нет */ }
}
const slots = computed(() => next.value ? ownSlots(next.value, auth.person?.id) : [])
const eventLink = computed(() => next.value ? { path: `/events/${encodeURIComponent(next.value.id)}`, query: { return: `/calendar?date=${todayInChurch()}&view=list&scope=mine` } } : '')
watch(() => auth.sessionVersion, () => { generation++; next.value = null })
watch(() => settings.timezone, () => { if (settings.loaded) void load() })
onBeforeUnmount(() => { generation++ })
void load()
</script>

<template>
  <section v-if="next" class="home-section home-section--serving" aria-label="Вы служите">
    <header class="home-section__header"><h2>Вы служите</h2></header>
    <h3 class="serving__title"><NuxtLink :to="eventLink">{{ next.title }}</NuxtLink></h3>
    <p class="serving__when"><time :datetime="next.starts_at">{{ formatEventWhen(next.starts_at, next.ends_at) }}</time></p>
    <p v-if="slots.length" class="serving__slots">{{ slots.map(slot => slot.label).join(', ') }}</p>
    <div class="serving__actions">
      <NuxtLink class="ui-button ui-button--primary" :to="eventLink">Открыть</NuxtLink>
      <NuxtLink v-if="next.chat_id" class="ui-button" :to="`/chats/${encodeURIComponent(next.chat_id)}`">Чат события</NuxtLink>
    </div>
  </section>
</template>

<style scoped>
.serving__title { margin: 0 0 var(--ui-space-2); font-size: 1.25rem; }
.serving__title a { color: inherit; text-decoration: none; }
.serving__title a:hover { text-decoration: underline; }
.serving__when, .serving__slots { margin: 0 0 var(--ui-space-2); }
.serving__slots { color: var(--ui-text-muted); font-size: .875rem; }
.serving__actions { display: flex; flex-wrap: wrap; gap: var(--ui-space-3); margin-top: var(--ui-space-4); }
</style>
