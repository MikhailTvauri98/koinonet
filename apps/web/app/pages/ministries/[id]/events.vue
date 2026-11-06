<script setup lang="ts">
import type { EventItem } from '~/composables/useEvents'
import type { Ministry } from '~/utils/ministries'
import { apiErrorMessage } from '~/utils/apiError'
import MinistryTabs from '~/components/ministries/MinistryTabs.vue'
import CalendarBrowser from '~/components/calendar/CalendarBrowser.vue'
import PageHeader from '~/components/ui/PageHeader.vue'
import EventEditor from '~/components/calendar/EventEditor.vue'
const route = useRoute(), router = useRouter(), api = useApi(), auth = useAuthStore(), settings = useSettingsStore(), { canIn } = useCan()
const { load: loadEvents } = useEvents()
const id = computed(() => String(route.params.id)), ministry = ref<Ministry | null>(null), events = ref<EventItem[]>([])
const { state, range, initialize, update, today, move, returnContext } = useCalendarView(() => `ministry:${id.value}`)
const loading = ref(false), errorMessage = ref(''), creating = ref(false)
const canCreate = computed(() => !!ministry.value && !ministry.value.archived_at && canIn(id.value, 'events.manage'))
let generation = 0, requestedKey = ''
const requestKey = () => range.value ? `${id.value}:${range.value.from}:${range.value.to}` : ''
async function load() {
  const version = ++generation, session = auth.sessionVersion
  loading.value = true; errorMessage.value = ''; events.value = []; ministry.value = null
  try {
    await settings.fetch()
    if (version !== generation || session !== auth.sessionVersion) return
    if (!state.value) initialize()
    requestedKey = requestKey()
    const response = await api.get<{ data: Ministry }>(`/ministries/${encodeURIComponent(id.value)}`)
    if (version !== generation || session !== auth.sessionVersion) return
    ministry.value = response.data
    const result = await loadEvents(range.value!, `ministry:${id.value}`)
    if (version === generation && session === auth.sessionVersion) events.value = result
  } catch (error) { if (version === generation && session === auth.sessionVersion) errorMessage.value = apiErrorMessage(error, 'Не удалось загрузить события служения. Попробуйте ещё раз.') }
  finally { if (version === generation && session === auth.sessionVersion) loading.value = false }
}
function saved(event: EventItem) { creating.value = false; void router.push({ path: `/events/${encodeURIComponent(event.id)}`, query: { return: returnContext.value } }) }
watch(requestKey, key => { if (state.value && key !== requestedKey) void load() })
watch(id, () => { state.value = null; creating.value = false; void load() })
watch(() => auth.permissions, () => { creating.value = false; void load() }, { deep: true })
watch(() => auth.sessionVersion, () => { generation++; events.value = []; ministry.value = null; creating.value = false; state.value = null; loading.value = false; errorMessage.value = '' })
watch(() => settings.timezone, () => { if (settings.loaded && state.value) void load() })
onBeforeUnmount(() => { generation++ })
await load()
</script>
<template>
  <main class="ministry-events">
    <PageHeader :title="creating ? 'Новое событие' : ministry ? `События служения «${ministry.name}»` : 'События служения'" :description="creating ? `Служение: ${ministry?.name ?? ''}` : undefined"><template #actions><button v-if="canCreate && !creating" type="button" class="ui-button ui-button--primary" data-test="create-event" @click="creating = true">Создать событие</button></template></PageHeader>
    <MinistryTabs :ministry-id="id" :chat-id="ministry?.chat_id" />
    <EventEditor v-if="creating && canCreate" :key="`${id}:${auth.sessionVersion}`" :initial-date="state?.date" :default-owner="{ type: 'ministry', ministryId: id }" @saved="saved" @cancel="creating = false" />
    <template v-else>
      <p v-if="ministry?.archived_at">Служение архивировано. События доступны для чтения.</p>
      <CalendarBrowser v-if="state && range" :events="events" :state="state" :range="range" :return-context="returnContext" :ministry-id="id" :loading="loading" :error="errorMessage" @update="update" @today="today" @move="move" @retry="load" />
      <p v-else-if="errorMessage" role="alert">{{ errorMessage }} <button type="button" class="ui-button" @click="load">Повторить</button></p>
    </template>
  </main>
</template>
<style scoped>
.ministry-events { min-width: 0; width: 100%; overflow-wrap: anywhere; }
</style>
