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
const scopes = [{ value: 'church', label: 'Церковь' }, { value: 'ministry', label: 'Мои служения' }] as const
// Закреплённые сверху; внутри группы порядок ответа сохраняется.
const sorted = computed(() => [...items.value.filter(item => item.pinned), ...items.value.filter(item => !item.pinned)])
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
      <div v-if="!ministryId" class="announcement-list__switch" role="group" aria-label="Область объявлений"><button v-for="option in scopes" :key="option.value" type="button" :data-test="`scope-${option.value}`" :aria-pressed="scope === option.value" :disabled="writing" @click="scope = option.value">{{ option.label }}</button></div>
      <button v-if="canPublish" ref="publishButton" class="ui-button ui-button--primary" data-test="publish" :disabled="editing" @click="openEditor">Опубликовать объявление</button>
    </div>
    <p v-if="published" role="status">Объявление опубликовано. <NuxtLink :to="`/announcements/${encodeURIComponent(published.id)}`" data-test="published-result">Открыть объявление</NuxtLink></p>
    <div v-if="editing && canPublish" class="announcement-list__editor">
      <h2 ref="editorHeading" tabindex="-1">Новое объявление</h2>
      <AnnouncementEditor :scope="ministryId ? 'ministry' : 'church'" :ministry-id="ministryId" @busy="writing = $event" @saved="saved" @cancel="closeEditor" />
    </div>
    <div v-if="sorted.length" class="announcement-list__group"><AnnouncementCard v-for="item in sorted" :key="item.id" :announcement="item" /></div>
    <LoadingState v-if="loading" :label="items.length ? 'Обновляем объявления…' : 'Загружаем объявления…'" />
    <EmptyState v-else-if="!items.length && !errorMessage" title="Объявлений пока нет." :description="emptyDescription" />
    <p v-if="errorMessage" role="alert">{{ errorMessage }} <button type="button" data-test="retry-announcements" :disabled="loading" @click="load(failedReset)">Повторить</button></p>
    <button v-if="page < lastPage && !errorMessage && page" class="ui-button ui-button--quiet" data-test="more" :disabled="loading" @click="load()">Показать ещё</button>
  </section>
</template>

<style scoped>
section { min-width: 0; overflow-wrap: anywhere; }
.announcement-list__toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--ui-space-3); margin-bottom: var(--ui-space-4); }
.announcement-list__switch { display: flex; flex-wrap: wrap; border: 1px solid var(--ui-border); padding: 3px; border-radius: var(--ui-radius-sm); background: var(--ui-surface); }
.announcement-list__switch button { min-height: 44px; padding: 8px 12px; border: 0; background: transparent; }
.announcement-list__switch button[aria-pressed=true] { color: var(--ui-accent); background: var(--ui-accent-soft); }
.announcement-list__group { margin-block: var(--ui-space-4); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); background: var(--ui-surface); overflow: clip; }
.announcement-list__group > :deep(.announcement-card + .announcement-card) { border-top: 1px solid var(--ui-border); }
.announcement-list__editor { margin-block: var(--ui-space-6); }
button { max-width: 100%; overflow-wrap: anywhere; }
</style>
