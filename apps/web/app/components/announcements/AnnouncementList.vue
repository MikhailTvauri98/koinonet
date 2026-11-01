<script setup lang="ts">
import type { Announcement, AnnouncementListResponse } from '~/utils/announcements'
import { apiErrorMessage, apiErrorStatus } from '~/utils/apiError'
import LoadingState from '~/components/ui/LoadingState.vue'
import EmptyState from '~/components/ui/EmptyState.vue'
import AnnouncementCard from './AnnouncementCard.vue'
import AnnouncementEditor from './AnnouncementEditor.vue'

const props = defineProps<{ ministryId?: string }>()
const api = useApi(), auth = useAuthStore()
const { can, canIn } = useCan()
const scope = ref<'church' | 'ministry'>(props.ministryId ? 'ministry' : 'church')
const items = ref<Announcement[]>([])
const page = ref(0), lastPage = ref(1)
const loading = ref(false), editing = ref(false)
const errorMessage = ref('')
let version = 0
let failedReset = true
const canPublish = computed(() => props.ministryId ? canIn(props.ministryId, 'announcements.publish') : scope.value === 'church' && can('announcements.church.publish'))
const emptyDescription = computed(() => canPublish.value ? 'Опубликуйте первое объявление кнопкой «Опубликовать объявление».' : props.ministryId ? 'Здесь появятся объявления этого служения. Вернитесь позже.' : 'Здесь появятся доступные объявления. Можно вернуться позже или выбрать другую область.')
async function load(reset = false) {
  const current = ++version, session = auth.sessionVersion
  failedReset = reset
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await api.get<AnnouncementListResponse>('/announcements', { scope: scope.value, ...(props.ministryId ? { ministry: props.ministryId } : {}), page: reset ? 1 : page.value + 1 })
    if (version !== current || session !== auth.sessionVersion) return
    items.value = [...new Map([...(reset ? [] : items.value), ...result.data].map(item => [item.id, item])).values()]
    page.value = result.meta.current_page
    lastPage.value = result.meta.last_page
  } catch (error) {
    if (version !== current || session !== auth.sessionVersion) return
    // A recoverable refresh keeps this session's known cards. A refusal must
    // not keep a snapshot that the account can no longer read.
    if ([401, 403].includes(apiErrorStatus(error) ?? 0)) {
      items.value = []
      page.value = 0
      lastPage.value = 1
      failedReset = true
    }
    errorMessage.value = apiErrorMessage(error, 'Не удалось загрузить объявления. Попробуйте ещё раз.')
  } finally { if (version === current && session === auth.sessionVersion) loading.value = false }
}
// A scope or account change is a new list; a refresh after publication is not.
watch([scope, () => props.ministryId, () => auth.sessionVersion], () => {
  version++
  editing.value = false
  items.value = []
  page.value = 0
  lastPage.value = 1
  errorMessage.value = ''
  loading.value = false
  if (auth.user) void load(true)
})
watch(canPublish, allowed => { if (!allowed) editing.value = false })
onBeforeUnmount(() => { version++ })
await load(true)
</script>

<template>
  <section>
    <label v-if="!ministryId">Показать <select v-model="scope"><option value="church">Церковь</option><option value="ministry">Мои служения</option></select></label>
    <button v-if="canPublish" data-test="publish" @click="editing = !editing">Опубликовать объявление</button>
    <AnnouncementEditor v-if="editing && canPublish" :scope="ministryId ? 'ministry' : 'church'" :ministry-id="ministryId" @saved="editing = false; load(true)" @cancel="editing = false" />
    <AnnouncementCard v-for="item in items" :key="item.id" :announcement="item" />
    <LoadingState v-if="loading" :label="items.length ? 'Обновляем объявления…' : 'Загружаем объявления…'" />
    <EmptyState v-else-if="!items.length && !errorMessage" title="Объявлений пока нет." :description="emptyDescription" />
    <p v-if="errorMessage" role="alert">{{ errorMessage }} <button type="button" data-test="retry-announcements" :disabled="loading" @click="load(failedReset)">Повторить</button></p>
    <button v-if="page < lastPage && !errorMessage && page" data-test="more" :disabled="loading" @click="load()">Показать ещё</button>
  </section>
</template>

<style scoped>
section { min-width: 0; overflow-wrap: anywhere; }
label { display: block; margin-bottom: var(--ui-space-3); }
select { display: block; min-width: 0; width: 100%; max-width: 40rem; }
button { max-width: 100%; overflow-wrap: anywhere; }
</style>
