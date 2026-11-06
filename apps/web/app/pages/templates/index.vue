<script setup lang="ts">
import { hasCalendarManagement, type TemplateItem } from '~/utils/templates'
import { recurrenceLabel } from '~/utils/recurrence'
import { apiErrorMessage } from '~/utils/apiError'
import PageHeader from '~/components/ui/PageHeader.vue'
import { isCalendarDate, safeCalendarReturn } from '~/composables/useCalendarView'
import TemplateEditor from '~/components/calendar/TemplateEditor.vue'
const api = useApi(), auth = useAuthStore(), router = useRouter(), route = useRoute()
const templates = ref<TemplateItem[]>([]), ministries = ref<{ id: string, name: string }[]>([])
const owner = ref(''), archived = ref(false), creating = ref(false), loading = ref(false), errorMessage = ref(''), filterError = ref('')
const confirmedId = ref('')
const canCreate = computed(() => hasCalendarManagement(auth.permissions))
let generation = 0
async function load() {
  const version = ++generation, session = auth.sessionVersion
  loading.value = true; errorMessage.value = ''; templates.value = []
  try {
    const response = await api.get<{ data: TemplateItem[] }>('/templates', { scope: owner.value ? `ministry:${owner.value}` : 'church', archived: archived.value ? 1 : 0 })
    if (version === generation && session === auth.sessionVersion) templates.value = response.data
  } catch (error) { if (version === generation && session === auth.sessionVersion) errorMessage.value = apiErrorMessage(error, 'Не удалось загрузить шаблоны. Попробуйте ещё раз.') }
  finally { if (version === generation && session === auth.sessionVersion) loading.value = false }
}
async function loadMinistries() {
  const session = auth.sessionVersion; filterError.value = ''
  try { const response = await api.get<{ data: { id: string, name: string }[] }>('/ministries'); if (session === auth.sessionVersion) ministries.value = response.data }
  catch (error) { if (session === auth.sessionVersion) filterError.value = apiErrorMessage(error, 'Не удалось загрузить фильтр служений. Попробуйте ещё раз.') }
}
function detailLink(id: string) { return { path: `/templates/${encodeURIComponent(id)}`, query: { ...(isCalendarDate(route.query.date) ? { date: route.query.date } : {}), ...(route.query.return ? { return: safeCalendarReturn(route.query.return) } : {}) } } }
async function saved(item: TemplateItem) {
  confirmedId.value = item.id
  try { await router.push(detailLink(item.id)) } catch { /* The confirmed template remains available through its link. */ }
}
watch([owner, archived], () => { void load() })
watch(() => auth.permissions, () => { void load(); void loadMinistries() }, { deep: true })
watch(canCreate, value => { if (!value) creating.value = false })
watch(() => auth.sessionVersion, () => { generation++; confirmedId.value = ''; templates.value = []; ministries.value = []; creating.value = false; errorMessage.value = ''; loading.value = false })
onBeforeUnmount(() => { generation++ })
await Promise.all([load(), loadMinistries()])
</script>
<template>
  <main class="templates-page">
    <PageHeader :title="creating ? 'Новый шаблон' : 'Шаблоны'" description="Заготовки для независимых событий. Изменение шаблона не меняет уже созданные события.">
      <template v-if="!creating && canCreate" #actions><button type="button" class="ui-button ui-button--primary" data-test="new-template" @click="creating = true">Создать шаблон</button></template>
    </PageHeader>
    <p v-if="confirmedId" role="status" class="template-confirmation">Шаблон сохранён. <NuxtLink :to="detailLink(confirmedId)">Открыть шаблон</NuxtLink></p>
    <TemplateEditor v-if="creating && canCreate" :key="auth.sessionVersion" @saved="saved" @cancel="creating = false" />
    <template v-else>
      <div class="templates-filters"><label class="ui-field">Владелец <select v-model="owner" data-test="owner-filter"><option value="">Все владельцы</option><option v-for="ministry in ministries" :key="ministry.id" :value="ministry.id">{{ ministry.name }}</option></select></label>
      <label class="ui-choice"><input v-model="archived" data-test="include-archived" type="checkbox"> Показать архивные</label></div>
      <p v-if="filterError" role="alert">{{ filterError }} <button type="button" class="ui-button" @click="loadMinistries">Повторить</button></p>
      <p v-if="loading" role="status">Загрузка шаблонов…</p>
      <p v-else-if="errorMessage" role="alert">{{ errorMessage }} <button type="button" class="ui-button" @click="load">Повторить</button></p>
      <template v-else>
        <p v-if="!templates.length">Шаблонов пока нет.</p>
        <div class="template-list">
          <article v-for="item in templates" :key="item.id" class="template-row">
            <div class="template-row__time"><time>{{ item.start_time }}</time><span>{{ item.duration_minutes }} мин.</span></div>
            <div class="template-row__body"><h2><NuxtLink :to="detailLink(item.id)">{{ item.title }}</NuxtLink></h2><p>{{ item.ministry?.name ?? 'Церковь' }} · {{ recurrenceLabel(item.recurrence) }}</p></div>
            <span class="template-state">{{ item.archived ? 'Архив · Неактивен' : item.active ? 'Активен' : 'Неактивен' }}</span>
          </article>
        </div>
      </template>
    </template>
  </main>
</template>
<style scoped>
.template-confirmation { margin-bottom: var(--ui-space-4); }
.templates-page { min-width: 0; overflow-wrap: anywhere; }
.templates-filters { display: flex; flex-wrap: wrap; align-items: end; gap: var(--ui-space-4); margin-bottom: var(--ui-space-6); }
.templates-filters > .ui-field { flex: 0 1 24rem; max-width: 100%; }
.template-list { border: 1px solid var(--ui-border); border-radius: 14px; background: var(--ui-surface); }
.template-row { display: grid; grid-template-columns: 6rem minmax(0, 1fr) auto; align-items: start; gap: var(--ui-space-4); padding: min(var(--ui-space-4), 16px); }
.template-row + .template-row { border-top: 1px solid var(--ui-border); }
.template-row__time { display: grid; gap: var(--ui-space-1); font-variant-numeric: tabular-nums; }
.template-row__time span, .template-row__body p { font-size: .875rem; color: var(--ui-text-muted); }
.template-row h2 { margin: 0; font-size: 1rem; }
.template-row h2 a { display: inline-flex; align-items: center; min-height: 44px; }
.template-row__body p { margin: var(--ui-space-1) 0 0; }
.template-state { background: var(--ui-surface-muted); border-radius: var(--ui-radius-sm); padding: var(--ui-space-1) var(--ui-space-2); font-size: .875rem; }
[role='alert'] { color: var(--ui-danger); }
@media (max-width: 599px) { .template-row { grid-template-columns: 4.5rem minmax(0, 1fr); gap: var(--ui-space-3); } .template-state { grid-column: 2; justify-self: start; } }
</style>
