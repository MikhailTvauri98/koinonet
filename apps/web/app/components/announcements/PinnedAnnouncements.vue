<script setup lang="ts">
import type { AnnouncementListResponse } from '~/utils/announcements'
import { apiErrorMessage } from '~/utils/apiError'
import AnnouncementCard from './AnnouncementCard.vue'
const api = useApi()
const items = ref<AnnouncementListResponse['data']>([])
const errorMessage = ref('')
async function load() {
  errorMessage.value = ''
  try {
    // API sorts pins first. Three records suffice, but still filter actual pins.
    const result = await api.get<AnnouncementListResponse>('/announcements', { scope: 'church', per_page: 3 })
    items.value = result.data.filter(item => item.scope === 'church' && item.pinned && !item.archived).slice(0, 3)
  } catch (error) { errorMessage.value = apiErrorMessage(error, 'Не удалось загрузить закреплённые объявления.') }
}
await load()
</script>

<template>
  <section aria-label="Закреплённые объявления">
    <h2>Закреплённые объявления</h2>
    <AnnouncementCard v-for="item in items" :key="item.id" :announcement="item" />
    <p v-if="!items.length && !errorMessage">Закреплённых объявлений пока нет.</p>
    <p v-if="errorMessage" role="alert">{{ errorMessage }} <button @click="load">Повторить</button></p>
  </section>
</template>
