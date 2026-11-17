<script setup lang="ts">
import type { Announcement, AnnouncementListResponse } from '~/utils/announcements'
import { apiErrorMessage } from '~/utils/apiError'
import { markdownToPlainText } from '~/utils/plainText'

// Последнее объявление служения: заголовок, две строки текста и время. Нет объявлений — блока нет.
const props = defineProps<{ ministryId: string }>()
const api = useApi(), auth = useAuthStore(), { formatMoment } = useChurchDate()
const latest = ref<Announcement | null>(null), loading = ref(false), errorMessage = ref('')
let generation = 0

async function load() {
  const current = ++generation, session = auth.sessionVersion, id = props.ministryId
  const live = () => current === generation && session === auth.sessionVersion && id === props.ministryId
  loading.value = true; errorMessage.value = ''
  try {
    const response = await api.get<AnnouncementListResponse>('/announcements', { scope: 'ministry', ministry: id, page: 1 })
    // Закреплённые идут первыми в списке, а «последнее» — самое новое по дате публикации.
    if (live()) latest.value = [...response.data].sort((a, b) => b.published_at.localeCompare(a.published_at))[0] ?? null
  } catch (error) {
    if (live()) errorMessage.value = apiErrorMessage(error, 'Не удалось загрузить объявления служения. Попробуйте ещё раз.')
  } finally { if (live()) loading.value = false }
}
function reset() { generation++; latest.value = null; errorMessage.value = ''; loading.value = false; if (auth.user) void load() }
watch([() => props.ministryId, () => auth.sessionVersion], reset, { flush: 'sync' })
onBeforeUnmount(() => { generation++ })
const preview = computed(() => latest.value ? markdownToPlainText(latest.value.body, 240) : '')
void load()
</script>

<template>
  <section v-if="latest || errorMessage" class="overview-block" aria-labelledby="overview-announcement-title" data-test="overview-announcement">
    <header class="overview-block__header">
      <h2 id="overview-announcement-title">Объявления служения</h2>
      <NuxtLink class="ui-button ui-button--quiet" :to="`/ministries/${encodeURIComponent(ministryId)}/announcements`" data-test="all-announcements">Все</NuxtLink>
    </header>
    <p v-if="errorMessage" role="alert">{{ errorMessage }} <button type="button" class="ui-button" data-test="retry-announcement" :disabled="loading" @click="load">Повторить</button></p>
    <article v-else-if="latest" class="latest-announcement">
      <h3><NuxtLink :to="`/announcements/${encodeURIComponent(latest.id)}`">{{ latest.title }}</NuxtLink></h3>
      <p v-if="preview" class="latest-announcement__text" data-test="announcement-preview">{{ preview }}</p>
      <p class="latest-announcement__meta"><time :datetime="latest.published_at">{{ formatMoment(latest.published_at) }}</time></p>
    </article>
  </section>
</template>

<style scoped>
.latest-announcement h3 { margin: 0; font-size: 1rem; }
.latest-announcement h3 a { display: inline-flex; align-items: center; min-height: var(--ui-control-height); }
.latest-announcement p { margin: 0; }
.latest-announcement__text { display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.latest-announcement__meta { color: var(--ui-text-muted); font-size: .875rem; margin-top: var(--ui-space-1) !important; }
[role='alert'] { color: var(--ui-danger); }
</style>
