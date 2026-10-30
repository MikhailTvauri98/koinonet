<script setup lang="ts">
import type { EventItem } from '~/composables/useEvents'
import type { Ministry } from '~/utils/ministries'
import { addCalendarDays, formatCalendarDay } from '~/composables/useEvents'
import { apiErrorMessage } from '~/utils/apiError'
import MinistryTabs from '~/components/ministries/MinistryTabs.vue'
import EventList from '~/components/calendar/EventList.vue'
import EventEditor from '~/components/calendar/EventEditor.vue'
const route = useRoute(), router = useRouter(), api = useApi(), auth = useAuthStore(), settings = useSettingsStore(), { canIn } = useCan()
const { todayInChurch } = useChurchDate(), { load: loadEvents } = useEvents()
const id = computed(() => String(route.params.id)), ministry = ref<Ministry | null>(null), events = ref<EventItem[]>([])
const from = ref(''), loading = ref(false), errorMessage = ref(''), creating = ref(false)
const range = computed(() => from.value ? { from: from.value, to: addCalendarDays(from.value, 27) } : null)
const canCreate = computed(() => !!ministry.value && !ministry.value.archived_at && canIn(id.value, 'events.manage'))
let generation = 0
async function load() {
  const version = ++generation, session = auth.sessionVersion
  loading.value = true; errorMessage.value = ''; events.value = []; ministry.value = null
  try {
    await settings.fetch()
    if (version !== generation || session !== auth.sessionVersion) return
    if (!from.value) from.value = todayInChurch()
    const response = await api.get<{ data: Ministry }>(`/ministries/${encodeURIComponent(id.value)}`)
    if (version !== generation || session !== auth.sessionVersion) return
    ministry.value = response.data
    const result = await loadEvents(range.value!, `ministry:${id.value}`)
    if (version === generation && session === auth.sessionVersion) events.value = result
  } catch (error) { if (version === generation && session === auth.sessionVersion) errorMessage.value = apiErrorMessage(error, 'Не удалось загрузить события служения. Попробуйте ещё раз.') }
  finally { if (version === generation && session === auth.sessionVersion) loading.value = false }
}
function move(days: number) { if (from.value) { from.value = addCalendarDays(from.value, days); void load() } }
function saved(event: EventItem) { creating.value = false; void router.push(`/events/${encodeURIComponent(event.id)}`) }
watch(id, () => { from.value = ''; creating.value = false; void load() })
watch(() => auth.permissions, () => { creating.value = false; void load() }, { deep: true })
watch(() => auth.sessionVersion, () => { generation++; events.value = []; ministry.value = null; creating.value = false; from.value = ''; loading.value = false; errorMessage.value = '' })
watch(() => settings.timezone, () => { if (settings.loaded && from.value) { from.value = ''; void load() } })
onBeforeUnmount(() => { generation++ })
await load()
</script>
<template>
  <main class="ministry-events">
    <h1>События служения<span v-if="ministry"> «{{ ministry.name }}»</span></h1>
    <MinistryTabs :ministry-id="id" />
    <EventEditor v-if="creating && canCreate" :key="`${id}:${auth.sessionVersion}`" :default-owner="{ type: 'ministry', ministryId: id }" @saved="saved" @cancel="creating = false" />
    <template v-else>
      <button v-if="canCreate" type="button" data-test="create-event" @click="creating = true">Создать событие</button>
      <p v-if="ministry?.archived_at">Служение архивировано. События доступны для чтения.</p>
      <div v-if="range" class="period" role="group" aria-label="Период календаря"><button type="button" @click="move(-28)">Раньше</button><p>{{ formatCalendarDay(range.from) }} — {{ formatCalendarDay(range.to) }}</p><button type="button" @click="move(28)">Позже</button></div>
      <p v-if="loading" role="status">Загрузка событий…</p>
      <p v-else-if="errorMessage" role="alert">{{ errorMessage }} <button type="button" @click="load">Повторить</button></p>
      <EventList v-else :events="events" />
    </template>
  </main>
</template>
<style scoped>.ministry-events { max-width: 48rem; margin: auto; } .period { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; } button { font: inherit; padding: .6rem; } [role='alert'] { color: #a32020; }</style>
