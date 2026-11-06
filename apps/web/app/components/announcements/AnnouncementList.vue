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
const published = ref<Announcement | null>(null), writing = ref(false)
const editorHeading = ref<HTMLElement | null>(null), publishButton = ref<HTMLButtonElement | null>(null)
async function openEditor() { editing.value = true; await nextTick(); editorHeading.value?.focus() }
async function closeEditor() { editing.value = false; writing.value = false; await nextTick(); publishButton.value?.focus() }
async function saved(result: Announcement) { published.value = result; await closeEditor(); await load(true) }
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
  published.value = null
  writing.value = false
  items.value = []
  page.value = 0
  lastPage.value = 1
  errorMessage.value = ''
  loading.value = false
  if (auth.user) void load(true)
})
watch(canPublish, allowed => { if (!allowed) { editing.value = false; writing.value = false } }, { flush: 'sync' })
onBeforeUnmount(() => { version++ })
await load(true)
</script>

<template>
  <section>
    <div class="announcement-list__toolbar">
      <label v-if="!ministryId">Показать <select v-model="scope" :disabled="writing"><option value="church">Церковь</option><option value="ministry">Мои служения</option></select></label>
      <button v-if="canPublish" ref="publishButton" class="primary" data-test="publish" :disabled="editing" @click="openEditor">Опубликовать объявление</button>
    </div>
    <p v-if="published" role="status">Объявление опубликовано. <NuxtLink :to="`/announcements/${encodeURIComponent(published.id)}`" data-test="published-result">Открыть объявление</NuxtLink></p>
    <div v-if="editing && canPublish" class="announcement-list__editor">
      <h2 ref="editorHeading" tabindex="-1">Новое объявление</h2>
      <AnnouncementEditor :scope="ministryId ? 'ministry' : 'church'" :ministry-id="ministryId" @busy="writing = $event" @saved="saved" @cancel="closeEditor" />
    </div>
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
select { display: block; min-width: 0; width: 100%; max-width: 24rem; }
.announcement-list__toolbar { display: flex; align-items: end; flex-wrap: wrap; gap: var(--ui-space-3); margin-bottom: var(--ui-space-4); }
.announcement-list__toolbar label { flex: 1 1 16rem; margin: 0; }
.announcement-list__editor { margin-block: var(--ui-space-6); }
.primary { background: var(--ui-accent); color: var(--ui-on-accent); border-color: var(--ui-accent); font-weight: 600; }
button { max-width: 100%; overflow-wrap: anywhere; }
</style>
