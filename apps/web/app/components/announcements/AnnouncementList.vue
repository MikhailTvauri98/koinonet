<script setup lang="ts">
import type { Announcement, AnnouncementListResponse } from '~/utils/announcements'
import { apiErrorMessage } from '~/utils/apiError'
import AnnouncementCard from './AnnouncementCard.vue'
import AnnouncementEditor from './AnnouncementEditor.vue'

const props = defineProps<{ ministryId?: string }>()
const api = useApi()
const { can, canIn } = useCan()
const scope = ref<'church' | 'ministry'>(props.ministryId ? 'ministry' : 'church')
const items = ref<Announcement[]>([])
const page = ref(0), lastPage = ref(1)
const loading = ref(false), editing = ref(false)
const errorMessage = ref('')
let version = 0
const canPublish = computed(() => props.ministryId ? canIn(props.ministryId, 'announcements.publish') : scope.value === 'church' && can('announcements.church.publish'))
async function load(reset = false) {
  const current = ++version
  if (reset) { items.value = []; page.value = 0; lastPage.value = 1 }
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await api.get<AnnouncementListResponse>('/announcements', { scope: scope.value, ...(props.ministryId ? { ministry: props.ministryId } : {}), page: page.value + 1 })
    if (version !== current) return
    items.value = [...items.value, ...result.data]
    page.value = result.meta.current_page
    lastPage.value = result.meta.last_page
  } catch (error) {
    if (version === current) errorMessage.value = apiErrorMessage(error, 'Не удалось загрузить объявления. Попробуйте ещё раз.')
  } finally { if (version === current) loading.value = false }
}
watch([scope, () => props.ministryId], () => { editing.value = false; void load(true) })
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
    <p v-if="loading" role="status">Загружается…</p>
    <p v-else-if="!items.length && !errorMessage">Объявлений пока нет.</p>
    <p v-if="errorMessage" role="alert">{{ errorMessage }} <button @click="load()">Повторить</button></p>
    <button v-if="page < lastPage && !errorMessage" data-test="more" :disabled="loading" @click="load()">Показать ещё</button>
  </section>
</template>

<style scoped>
section { min-width: 0; overflow-wrap: anywhere; }
label { display: block; margin-bottom: var(--ui-space-3); }
select { display: block; min-width: 0; width: 100%; max-width: 40rem; }
button { max-width: 100%; overflow-wrap: anywhere; }
</style>
