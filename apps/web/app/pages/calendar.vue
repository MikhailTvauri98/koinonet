<script setup lang="ts">
import type { EventItem } from '~/composables/useEvents'
import type { Ministry } from '~/utils/ministries'
import { apiErrorMessage } from '~/utils/apiError'
import PageHeader from '~/components/ui/PageHeader.vue'
import CalendarBrowser from '~/components/calendar/CalendarBrowser.vue'
const settings = useSettingsStore(), auth = useAuthStore(), api = useApi()
const { load: loadEvents } = useEvents(), { can, canIn } = useCan()
const ministries = ref<Ministry[]>([]), ministriesError = ref('')
const { state, range, initialize, update, today, move, returnContext } = useCalendarView('church', () => ministries.value.map(m => `ministry:${m.id}`))
const canCreate = computed(() => can('calendar.church.manage') || can('ministries.manage_all') || Object.keys(auth.permissions.ministries).some(id => canIn(id, 'events.manage')))
const events = ref<EventItem[]>([]), loading = ref(false), errorMessage = ref('')
let generation = 0, choicesGeneration = 0, requestedKey = '', active = true
const requestKey = () => range.value ? `${range.value.from}:${range.value.to}:${state.value!.scope}` : ''
async function loadChoices() {
  const current = ++choicesGeneration, session = auth.sessionVersion
  ministries.value = []; ministriesError.value = ''
  if (!can('ministries.view_all') && !can('ministries.manage_all') && !Object.keys(auth.permissions.ministries).length) return
  try {
    const result = await api.get<{ data: Ministry[] }>('/ministries')
    if (current === choicesGeneration && session === auth.sessionVersion) ministries.value = result.data
  } catch (error) { if (current === choicesGeneration && session === auth.sessionVersion) ministriesError.value = apiErrorMessage(error, 'Не удалось загрузить фильтр служений.') }
}
async function load() {
  const current = ++generation, session = auth.sessionVersion
  loading.value = true; errorMessage.value = ''; events.value = []
  try {
    await settings.fetch()
    if (current !== generation || session !== auth.sessionVersion) return
    if (!state.value) initialize()
    requestedKey = requestKey()
    const result = await loadEvents(range.value!, state.value!.scope)
    if (current === generation && session === auth.sessionVersion) events.value = result
  } catch (error) { if (current === generation && session === auth.sessionVersion) errorMessage.value = apiErrorMessage(error, 'Не удалось загрузить календарь. Попробуйте ещё раз.') }
  finally { if (current === generation && session === auth.sessionVersion) loading.value = false }
}
watch(requestKey, key => { if (state.value && key !== requestedKey) void load() })
watch(() => auth.sessionVersion, () => { generation++; choicesGeneration++; events.value = []; ministries.value = []; state.value = null; loading.value = false; errorMessage.value = ''; ministriesError.value = '' })
watch(() => auth.permissions, async () => { generation++; events.value = []; await loadChoices(); if (state.value) { update({ scope: state.value.scope }); void load() } }, { deep: true })
watch(() => settings.timezone, () => { if (settings.loaded && state.value) void load() })
onBeforeUnmount(() => { active = false; generation++; choicesGeneration++ })
const startupSession = auth.sessionVersion
await loadChoices()
if (active && startupSession === auth.sessionVersion) await load()
</script>
<template>
  <main class="calendar-page">
    <PageHeader title="Календарь" description="События церкви и ваши назначения"><template #actions><NuxtLink v-if="canCreate && state" class="ui-button ui-button--primary" :to="{ path: '/events/new', query: { date: state.date, return: returnContext } }">Создать событие</NuxtLink></template></PageHeader>
    <p v-if="ministriesError" role="alert">{{ ministriesError }} <button type="button" class="ui-button" @click="loadChoices">Повторить</button></p>
    <CalendarBrowser v-if="state && range" :events="events" :state="state" :range="range" :return-context="returnContext" :ministries="ministries" :can-create="canCreate" :loading="loading" :error="errorMessage" @update="update" @today="today" @move="move" @retry="load" />
    <p v-else-if="loading" role="status">Загружаем календарь…</p>
    <p v-else-if="errorMessage" role="alert">{{ errorMessage }} <button type="button" class="ui-button" data-test="retry-calendar" @click="load">Повторить</button></p>
  </main>
</template>
<style scoped>
.calendar-page { min-width: 0; width: 100%; overflow-wrap: anywhere; }
</style>
