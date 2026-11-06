<script setup lang="ts">
import type { TemplateItem } from '~/utils/templates'
import { recurrenceLabel } from '~/utils/recurrence'
import { apiErrorMessage } from '~/utils/apiError'
import PageHeader from '~/components/ui/PageHeader.vue'
import FormSection from '~/components/ui/FormSection.vue'
import UiDialog from '~/components/ui/UiDialog.vue'
import { isCalendarDate, safeCalendarReturn } from '~/composables/useCalendarView'
import TemplateEditor from '~/components/calendar/TemplateEditor.vue'
const route = useRoute(), router = useRouter(), api = useApi(), auth = useAuthStore(), { can, canIn } = useCan()
const id = computed(() => String(route.params.id))
const item = ref<TemplateItem | null>(null), loading = ref(false), errorMessage = ref(''), actionError = ref(''), editing = ref(false), confirmArchive = ref(false), busy = ref(false), date = ref('')
const createdId = ref(''), heading = ref<HTMLElement | null>(null)
const returnTo = computed(() => safeCalendarReturn(route.query.return))
const createdLink = computed(() => route.query.return ? { path: `/events/${encodeURIComponent(createdId.value)}`, query: { return: returnTo.value } } : `/events/${encodeURIComponent(createdId.value)}`)
const manageable = computed(() => !!item.value?.can_manage && !item.value.archived && (item.value.owner_type === 'church' ? can('calendar.church.manage') : !!item.value.ministry && canIn(item.value.ministry.id, 'events.manage')))
let generation = 0
async function load() {
  const version = ++generation, session = auth.sessionVersion
  loading.value = true; item.value = null; errorMessage.value = ''; actionError.value = ''; editing.value = false; confirmArchive.value = false; date.value = isCalendarDate(route.query.date) ? route.query.date : ''; createdId.value = ''; busy.value = false
  try { const response = await api.get<{ data: TemplateItem }>(`/templates/${encodeURIComponent(id.value)}`); if (version === generation && session === auth.sessionVersion) item.value = response.data }
  catch (error) { if (version === generation && session === auth.sessionVersion) errorMessage.value = apiErrorMessage(error, 'Не удалось загрузить шаблон. Попробуйте ещё раз.') }
  finally { if (version === generation && session === auth.sessionVersion) loading.value = false }
}
async function act(action: 'active' | 'archive' | 'create') {
  if (busy.value || !manageable.value || !item.value) return
  if (action === 'create' && createdId.value) return
  if (action === 'create' && !isCalendarDate(date.value)) { actionError.value = 'Выберите дату события.'; return }
  const version = generation, session = auth.sessionVersion, current = item.value
  busy.value = true; actionError.value = ''
  try {
    if (action === 'create') {
      const result = await api.post<{ data: { id: string } }>(`/templates/${encodeURIComponent(current.id)}/create-event`, { date: date.value })
      if (version === generation && session === auth.sessionVersion) {
        createdId.value = result.data.id
        try { await router.push(createdLink.value) } catch { /* The event is already confirmed; keep its link and do not repeat POST. */ }
      }
    } else {
      const result = action === 'active' ? await api.patch<{ data: TemplateItem }>(`/templates/${encodeURIComponent(current.id)}`, { active: !current.active }) : await api.post<{ data: TemplateItem }>(`/templates/${encodeURIComponent(current.id)}/archive`)
      if (version === generation && session === auth.sessionVersion) { item.value = result.data; confirmArchive.value = false }
    }
  } catch (error) { if (version === generation && session === auth.sessionVersion) actionError.value = apiErrorMessage(error, 'Не удалось выполнить действие. Попробуйте ещё раз.') }
  finally { if (version === generation && session === auth.sessionVersion) busy.value = false }
}
function saved(updated: TemplateItem) { item.value = updated; editing.value = false; void focusHeading() }
async function focusHeading() { await nextTick(); const title = heading.value?.querySelector<HTMLElement>('h1'); title?.setAttribute('tabindex', '-1'); title?.focus() }
function edit() { editing.value = true; void focusHeading() }
function cancelEdit() { editing.value = false; void focusHeading() }
watch(id, () => { void load() })
const accessState = computed(() => {
  const current = item.value, ministryId = current?.ministry?.id
  const manage = current?.owner_type === 'church' ? can('calendar.church.manage') : !!ministryId && canIn(ministryId, 'events.manage')
  const visible = manage || !!current && !current.archived && (current.owner_type === 'church' ? current.visibility === 'church' : can('ministries.view_all') || !!ministryId && Object.hasOwn(auth.permissions.ministries, ministryId))
  return { id: current?.id, manage, visible }
})
watch(accessState, (current, previous) => {
  if (current.id && current.id === previous.id && (current.manage !== previous.manage || current.visible !== previous.visible)) void load()
})
watch(() => auth.sessionVersion, () => { generation++; item.value = null; editing.value = false; confirmArchive.value = false; busy.value = false; errorMessage.value = ''; actionError.value = ''; date.value = ''; createdId.value = '' })
onBeforeUnmount(() => { generation++ })
await load()
</script>
<template>
  <main class="template-page">
    <p v-if="loading" role="status">Загрузка шаблона…</p>
    <p v-else-if="errorMessage" role="alert">{{ errorMessage }} <button type="button" class="ui-button" @click="load">Повторить</button></p>
    <template v-else-if="item">
      <div ref="heading"><PageHeader :title="editing ? 'Редактирование шаблона' : item.title" :description="editing ? item.title : 'Из шаблона создаются обычные независимые события.'">
        <template #breadcrumbs><NuxtLink :to="{ path: '/templates', query: { ...(isCalendarDate(route.query.date) ? { date: route.query.date } : {}), ...(route.query.return ? { return: returnTo } : {}) } }">К шаблонам</NuxtLink></template>
        <template v-if="!editing && manageable" #actions><button type="button" class="ui-button" data-test="edit-template" :disabled="busy" @click="edit">Редактировать шаблон</button></template>
      </PageHeader></div>
      <TemplateEditor v-if="editing && manageable" :key="item.id" :template="item" @saved="saved" @cancel="cancelEdit" />
      <template v-else>
        <div class="template-summary">
          <div class="template-summary__time"><time>{{ item.start_time }}</time><span>{{ item.duration_minutes }} мин. · время церкви</span></div>
          <div><p class="template-summary__rule">{{ recurrenceLabel(item.recurrence) }}</p><p class="ui-hint">{{ item.ministry?.name ?? 'Церковь' }}</p></div>
          <span class="template-state">{{ item.archived ? 'Архив — только чтение' : item.active ? 'Активен' : 'Неактивен' }}</span>
        </div>
        <p v-if="!item.active" class="ui-hint">Автоматическое создание событий выключено.</p>
        <p class="template-independence ui-hint">Правки и архивация шаблона не меняют уже созданные события.</p>
        <div class="ui-form-grid">
          <FormSection title="О шаблоне">
            <p v-if="item.description" class="description">{{ item.description }}</p><p v-if="item.location">Место: {{ item.location }}</p>
            <p class="ui-hint">Видимость: {{ { church: 'Вся церковь', ministry: 'Служение', assigned: 'Только назначенные' }[item.visibility] }}</p>
            <p v-if="item.recurrence?.type === 'biweekly'" class="ui-hint">Опорная дата: {{ item.recurrence.anchor_date.split('-').reverse().join('.') }}. От ближайшего выбранного дня недели не раньше этой даты отсчитываются две недели.</p>
            <p v-if="item.recurrence?.type === 'monthly_nth_weekday' && item.recurrence.nth === 5" class="ui-hint">Месяцы без пятого выбранного дня пропускаются.</p>
          </FormSection>
          <FormSection title="Слоты">
            <p v-if="!item.slots.length" class="ui-hint">Слотов пока нет.</p>
            <ul v-else class="template-slots"><li v-for="slot in item.slots" :key="slot.id"><div><strong>{{ slot.label }}</strong><p v-if="slot.role" class="ui-hint">{{ slot.role.name }}</p><p v-else class="ui-hint">Свободный слот</p></div><span>{{ slot.required_count }} чел.</span></li></ul>
          </FormSection>
          <FormSection v-if="manageable" title="Создать событие" description="Выберите дату по календарю церкви. Созданное событие можно менять независимо от шаблона.">
            <label class="ui-field">Дата события по календарю церкви <input v-model="date" data-test="event-date" type="date" min="0001-01-01" max="9998-12-31" :disabled="busy || !!createdId"></label>
            <button type="button" class="ui-button ui-button--primary" data-test="create-event" :disabled="busy || !!createdId" @click="act('create')">{{ busy ? 'Создаётся…' : 'Создать событие на дату' }}</button>
            <p v-if="createdId" role="status">Событие создано. <NuxtLink :to="createdLink">Открыть событие</NuxtLink></p>
          </FormSection>
          <FormSection v-if="manageable" title="Автоматическое создание" :description="item.recurrence ? 'Активный шаблон создаёт события по правилу повторения.' : 'Без повторения события создаются только вручную.'">
            <button type="button" class="ui-button" data-test="toggle-active" :disabled="busy" @click="act('active')">{{ item.active ? 'Выключить автоматическое создание' : 'Включить автоматическое создание' }}</button>
          </FormSection>
        </div>
        <p v-if="actionError && !confirmArchive" role="alert" class="ui-field-error">{{ actionError }}</p>
        <div v-if="manageable" class="template-archive"><button type="button" class="ui-button ui-button--danger" data-test="archive-template" :disabled="busy" @click="confirmArchive = true; actionError = ''">Архивировать шаблон</button></div>
        <UiDialog :open="confirmArchive && manageable" label="Архивация шаблона" @close="confirmArchive = false">
          <h2>Архивировать шаблон?</h2><p>Новые события автоматически создаваться не будут. Уже созданные события сохранятся.</p>
          <p v-if="actionError" role="alert" class="ui-field-error">{{ actionError }}</p>
          <template #actions><button type="button" class="ui-button" :disabled="busy" @click="confirmArchive = false">Назад</button><button type="button" class="ui-button ui-button--danger" data-test="confirm-archive" :disabled="busy" @click="act('archive')">Подтвердить архивацию</button></template>
        </UiDialog>
      </template>
    </template>
  </main>
</template>
<style scoped>
.template-page { min-width: 0; overflow-wrap: anywhere; }
.template-summary { display: flex; flex-wrap: wrap; align-items: start; gap: var(--ui-space-6); margin-bottom: var(--ui-space-4); padding: min(var(--ui-space-6), 24px); background: var(--ui-surface); border: 1px solid var(--ui-border); border-radius: 14px; }
.template-summary > * { min-width: 0; }
.template-summary__time { display: grid; gap: var(--ui-space-1); font-variant-numeric: tabular-nums; }
.template-summary__time time { font-size: 1.5rem; font-weight: 600; }
.template-summary__time span { font-size: .875rem; color: var(--ui-text-muted); }
.template-summary__rule { margin: 0 0 var(--ui-space-2); font-weight: 600; }
.template-state { padding: var(--ui-space-1) var(--ui-space-2); font-size: .875rem; background: var(--ui-surface-muted); border-radius: var(--ui-radius-sm); }
.template-independence { margin-block: var(--ui-space-4) var(--ui-space-6); }
.description { white-space: pre-wrap; margin: 0; }
.template-slots { list-style: none; padding: 0; margin: 0; }
.template-slots li { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--ui-space-3); padding-block: var(--ui-space-3); border-bottom: 1px solid var(--ui-border); }
.template-slots li:first-child { padding-top: 0; }
.template-slots li:last-child { border-bottom: 0; }
.template-slots li > div { flex: 1 1 10rem; min-width: 0; }
.template-archive { margin-top: var(--ui-space-6); padding-top: var(--ui-space-4); border-top: 1px solid var(--ui-border); }
[role='alert'] { color: var(--ui-danger); }
</style>
