<script setup lang="ts">
import type { AnnouncementListResponse } from '~/utils/announcements'
import { apiErrorMessage, apiErrorStatus, isConnectionFailure } from '~/utils/apiError'
import { markdownToPlainText } from '~/utils/plainText'
const api = useApi(), auth = useAuthStore(), { formatMoment } = useChurchDate()
const items = ref<AnnouncementListResponse['data']>([]), errorMessage = ref(''), loading = ref(false), loaded = ref(false), offline = ref(false)
let generation = 0
async function load() {
  const current = ++generation, session = auth.sessionVersion
  const active = () => current === generation && session === auth.sessionVersion
  errorMessage.value = ''; offline.value = false; loading.value = true
  try {
    const result = await api.get<AnnouncementListResponse>('/announcements', { scope: 'church', per_page: 10 })
    if (active()) {
      const church = result.data.filter(item => item.scope === 'church' && !item.archived)
      // Закреплённые первыми, затем свежие в порядке ответа.
      items.value = [...church.filter(item => item.pinned), ...church.filter(item => !item.pinned)].slice(0, 4)
      loaded.value = true
    }
  } catch (error) {
    if (!active()) return
    if ([401, 403].includes(apiErrorStatus(error) ?? 0)) items.value = []
    // Обрыв связи: остаётся последний список, красного текста нет, статус показывает общий индикатор.
    if (isConnectionFailure(error)) offline.value = true
    else errorMessage.value = apiErrorMessage(error, 'Не удалось загрузить объявления.')
  } finally { if (active()) loading.value = false }
}
watch(() => auth.sessionVersion, () => { generation++; items.value = []; errorMessage.value = ''; loading.value = false; loaded.value = false; offline.value = false; if (auth.user) void load() }, { flush: 'sync' })
onBeforeUnmount(() => { generation++ })
void load()
</script>

<template>
  <section class="home-section home-section--announcements" aria-label="Объявления">
    <header class="home-section__header"><h2>Объявления</h2><NuxtLink class="ui-button ui-button--quiet" to="/announcements">Все объявления</NuxtLink></header>
    <ul v-if="items.length" class="home-announcements">
      <li v-for="item in items" :key="item.id" class="home-announcement">
        <span v-if="item.pinned" class="home-announcement__pin" :data-test="`pinned-${item.id}`">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true" focusable="false"><path d="M5 1.5h6V3l-1 1v3.2l2 2.3V10.5H8.75V15h-1.5v-4.5H3.5V9.5l2-2.3V4L4.5 3V1.5z" /></svg>
          Закреплено
        </span>
        <h3><NuxtLink :to="`/announcements/${encodeURIComponent(item.id)}`">{{ item.title }}</NuxtLink></h3>
        <p class="home-announcement__text">{{ markdownToPlainText(item.body, 160) }}</p>
        <p class="home-announcement__meta"><time :datetime="item.published_at">{{ formatMoment(item.published_at) }}</time></p>
      </li>
    </ul>
    <p v-if="loading && !loaded" role="status">Загружаем объявления…</p>
    <p v-else-if="loaded && !loading && !items.length && !errorMessage && !offline">Объявлений пока нет.</p>
    <p v-if="errorMessage" role="alert">{{ errorMessage }} <button type="button" class="ui-button" :disabled="loading" @click="load">Повторить</button></p>
  </section>
</template>

<style scoped>
.home-announcements { list-style: none; margin: 0; padding: 0; }
.home-announcement { position: relative; padding: var(--ui-space-3) 0; border-bottom: 1px solid var(--ui-border); min-width: 0; }
.home-announcement:last-child { border-bottom: 0; }
.home-announcement h3 { margin: var(--ui-space-1) 0; font-size: 1rem; }
.home-announcement h3 a { display: inline-flex; align-items: center; min-height: var(--ui-control-height); color: inherit; text-decoration: none; }
.home-announcement h3 a:hover { text-decoration: underline; }
/* Растянутая ссылка: вся карточка кликабельна, ссылка одна. */
.home-announcement h3 a::after { content: ''; position: absolute; inset: 0; }
.home-announcement:focus-within { outline: 2px solid var(--ui-accent); outline-offset: -2px; }
.home-announcement h3 a:focus-visible { outline: none; }
.home-announcement__pin { display: inline-flex; align-items: center; gap: var(--ui-space-1); color: var(--ui-accent); font-size: .875rem; font-weight: 600; }
.home-announcement__text { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden; margin: 0; color: var(--ui-text-muted); }
.home-announcement__meta { margin: var(--ui-space-1) 0 0; color: var(--ui-text-muted); font-size: .875rem; }
</style>
