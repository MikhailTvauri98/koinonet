<script setup lang="ts">
import type { AnnouncementListResponse } from '~/utils/announcements'
import { apiErrorMessage, apiErrorStatus } from '~/utils/apiError'
import AnnouncementCard from './AnnouncementCard.vue'
const api = useApi(), auth = useAuthStore()
const items = ref<AnnouncementListResponse['data']>([]), errorMessage = ref(''), loading = ref(false)
let generation = 0
async function load() {
  const current = ++generation, session = auth.sessionVersion
  const active = () => current === generation && session === auth.sessionVersion
  errorMessage.value = ''; loading.value = true
  try {
    const result = await api.get<AnnouncementListResponse>('/announcements', { scope: 'church', per_page: 3 })
    if (active()) items.value = result.data.filter(item => item.scope === 'church' && item.pinned && !item.archived).slice(0, 3)
  } catch (error) {
    if (!active()) return
    if ([401, 403].includes(apiErrorStatus(error) ?? 0)) items.value = []
    errorMessage.value = apiErrorMessage(error, 'Не удалось загрузить закреплённые объявления.')
  } finally { if (active()) loading.value = false }
}
watch(() => auth.sessionVersion, () => { generation++; items.value = []; errorMessage.value = ''; loading.value = false; if (auth.user) void load() }, { flush: 'sync' })
onBeforeUnmount(() => { generation++ })
void load()
</script>

<template>
  <section class="home-section home-section--announcements" aria-label="Закреплённые объявления">
    <header class="home-section__header"><h2>Закреплённые объявления</h2><NuxtLink to="/announcements">Все объявления</NuxtLink></header>
    <AnnouncementCard v-for="item in items" :key="item.id" :announcement="item" :heading-level="3" />
    <p v-if="loading" role="status">Загружаем объявления…</p>
    <p v-else-if="!items.length && !errorMessage">Закреплённых объявлений пока нет.</p>
    <p v-if="errorMessage" role="alert">{{ errorMessage }} <button type="button" :disabled="loading" @click="load">Повторить</button></p>
  </section>
</template>
