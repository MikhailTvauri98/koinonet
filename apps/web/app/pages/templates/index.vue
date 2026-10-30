<script setup lang="ts">
import { hasCalendarManagement, type TemplateItem } from '~/utils/templates'
import { recurrenceLabel } from '~/utils/recurrence'
import { apiErrorMessage } from '~/utils/apiError'
import TemplateEditor from '~/components/calendar/TemplateEditor.vue'
const api = useApi(), auth = useAuthStore(), router = useRouter()
const templates = ref<TemplateItem[]>([]), ministries = ref<{ id: string, name: string }[]>([])
const owner = ref(''), archived = ref(false), creating = ref(false), loading = ref(false), errorMessage = ref(''), filterError = ref('')
const canCreate = computed(() => hasCalendarManagement(auth.permissions))
let generation = 0
async function load() {
  const version = ++generation, session = auth.sessionVersion
  loading.value = true; errorMessage.value = ''; templates.value = []
  try {
    const response = await api.get<{ data: TemplateItem[] }>('/templates', { scope: owner.value ? `ministry:${owner.value}` : 'church', archived: archived.value })
    if (version === generation && session === auth.sessionVersion) templates.value = response.data
  } catch (error) { if (version === generation && session === auth.sessionVersion) errorMessage.value = apiErrorMessage(error, 'Не удалось загрузить шаблоны. Попробуйте ещё раз.') }
  finally { if (version === generation && session === auth.sessionVersion) loading.value = false }
}
async function loadMinistries() {
  const session = auth.sessionVersion; filterError.value = ''
  try { const response = await api.get<{ data: { id: string, name: string }[] }>('/ministries'); if (session === auth.sessionVersion) ministries.value = response.data }
  catch (error) { if (session === auth.sessionVersion) filterError.value = apiErrorMessage(error, 'Не удалось загрузить фильтр служений. Попробуйте ещё раз.') }
}
function saved(item: TemplateItem) { creating.value = false; void router.push(`/templates/${encodeURIComponent(item.id)}`) }
watch([owner, archived], () => { void load() })
watch(() => auth.permissions, () => { creating.value = false; void load(); void loadMinistries() }, { deep: true })
watch(() => auth.sessionVersion, () => { generation++; templates.value = []; ministries.value = []; creating.value = false; errorMessage.value = ''; loading.value = false })
onBeforeUnmount(() => { generation++ })
await Promise.all([load(), loadMinistries()])
</script>
<template>
  <main class="templates-page">
    <h1>Шаблоны</h1>
    <TemplateEditor v-if="creating && canCreate" :key="auth.sessionVersion" @saved="saved" @cancel="creating = false" />
    <template v-else>
      <button v-if="canCreate" type="button" data-test="new-template" @click="creating = true">Создать шаблон</button>
      <label>Владелец <select v-model="owner" data-test="owner-filter"><option value="">Все владельцы</option><option v-for="ministry in ministries" :key="ministry.id" :value="ministry.id">{{ ministry.name }}</option></select></label>
      <label><input v-model="archived" data-test="include-archived" type="checkbox"> Показать архивные</label>
      <p v-if="filterError" role="alert">{{ filterError }} <button type="button" @click="loadMinistries">Повторить</button></p>
      <p v-if="loading" role="status">Загрузка шаблонов…</p>
      <p v-else-if="errorMessage" role="alert">{{ errorMessage }} <button type="button" @click="load">Повторить</button></p>
      <template v-else>
        <p v-if="!templates.length">Шаблонов пока нет.</p>
        <article v-for="item in templates" :key="item.id">
          <h2><NuxtLink :to="`/templates/${encodeURIComponent(item.id)}`">{{ item.title }}</NuxtLink></h2>
          <p>{{ item.ministry?.name ?? 'Церковь' }} · {{ recurrenceLabel(item.recurrence) }}</p>
          <p>{{ item.start_time }} · {{ item.duration_minutes }} мин.</p>
          <p v-if="!item.active">Неактивен</p><p v-if="item.archived">Архив</p>
        </article>
      </template>
    </template>
  </main>
</template>
<style scoped>.templates-page { max-width: 48rem; margin: auto; } article { border: 1px solid #d8dce2; border-radius: .5rem; padding: 1rem; margin: 1rem 0; } label { display: block; margin: 1rem 0; } button, select { padding: .6rem; font: inherit; } [role='alert'] { color: #a32020; }</style>
