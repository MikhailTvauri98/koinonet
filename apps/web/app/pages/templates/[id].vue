<script setup lang="ts">
import type { TemplateItem } from '~/utils/templates'
import { recurrenceLabel } from '~/utils/recurrence'
import { apiErrorMessage } from '~/utils/apiError'
import TemplateEditor from '~/components/calendar/TemplateEditor.vue'
const route = useRoute(), router = useRouter(), api = useApi(), auth = useAuthStore(), { can, canIn } = useCan()
const id = computed(() => String(route.params.id))
const item = ref<TemplateItem | null>(null), loading = ref(false), errorMessage = ref(''), actionError = ref(''), editing = ref(false), confirmArchive = ref(false), busy = ref(false), date = ref('')
const manageable = computed(() => !!item.value?.can_manage && !item.value.archived && (item.value.owner_type === 'church' ? can('calendar.church.manage') : !!item.value.ministry && canIn(item.value.ministry.id, 'events.manage')))
let generation = 0
async function load() {
  const version = ++generation, session = auth.sessionVersion
  loading.value = true; item.value = null; errorMessage.value = ''; actionError.value = ''; editing.value = false; confirmArchive.value = false; date.value = ''; busy.value = false
  try { const response = await api.get<{ data: TemplateItem }>(`/templates/${encodeURIComponent(id.value)}`); if (version === generation && session === auth.sessionVersion) item.value = response.data }
  catch (error) { if (version === generation && session === auth.sessionVersion) errorMessage.value = apiErrorMessage(error, 'Не удалось загрузить шаблон. Попробуйте ещё раз.') }
  finally { if (version === generation && session === auth.sessionVersion) loading.value = false }
}
async function act(action: 'active' | 'archive' | 'create') {
  if (busy.value || !manageable.value || !item.value) return
  if (action === 'create' && !/^\d{4}-\d{2}-\d{2}$/.test(date.value)) { actionError.value = 'Выберите дату события.'; return }
  const version = generation, session = auth.sessionVersion, current = item.value
  busy.value = true; actionError.value = ''
  try {
    if (action === 'create') {
      const result = await api.post<{ data: { id: string } }>(`/templates/${encodeURIComponent(current.id)}/create-event`, { date: date.value })
      if (version === generation && session === auth.sessionVersion) void router.push(`/events/${encodeURIComponent(result.data.id)}`)
    } else {
      const result = action === 'active' ? await api.patch<{ data: TemplateItem }>(`/templates/${encodeURIComponent(current.id)}`, { active: !current.active }) : await api.post<{ data: TemplateItem }>(`/templates/${encodeURIComponent(current.id)}/archive`)
      if (version === generation && session === auth.sessionVersion) { item.value = result.data; confirmArchive.value = false }
    }
  } catch (error) { if (version === generation && session === auth.sessionVersion) actionError.value = apiErrorMessage(error, 'Не удалось выполнить действие. Попробуйте ещё раз.') }
  finally { if (version === generation && session === auth.sessionVersion) busy.value = false }
}
function saved(updated: TemplateItem) { item.value = updated; editing.value = false }
watch(id, () => { void load() })
watch(() => auth.permissions, () => { void load() }, { deep: true })
watch(() => auth.sessionVersion, () => { generation++; item.value = null; editing.value = false; confirmArchive.value = false; busy.value = false; errorMessage.value = ''; actionError.value = ''; date.value = '' })
onBeforeUnmount(() => { generation++ })
await load()
</script>
<template>
  <main class="template-page">
    <NuxtLink to="/templates">К шаблонам</NuxtLink>
    <p v-if="loading" role="status">Загрузка шаблона…</p>
    <p v-else-if="errorMessage" role="alert">{{ errorMessage }} <button type="button" @click="load">Повторить</button></p>
    <template v-else-if="item">
      <h1>{{ item.title }}</h1>
      <TemplateEditor v-if="editing && manageable" :key="item.id" :template="item" @saved="saved" @cancel="editing = false" />
      <template v-else>
        <p>{{ item.ministry?.name ?? 'Церковь' }} · {{ recurrenceLabel(item.recurrence) }}</p>
        <p>{{ item.start_time }} по времени церкви · {{ item.duration_minutes }} мин.</p>
        <p>Видимость: {{ { church: 'Вся церковь', ministry: 'Служение', assigned: 'Только назначенные' }[item.visibility] }}</p>
        <p v-if="!item.active">Неактивен: автоматическое создание событий выключено.</p><p v-if="item.archived">Архив — только чтение.</p>
        <p v-if="item.description" class="description">{{ item.description }}</p><p v-if="item.location">Место: {{ item.location }}</p>
        <h2>Слоты</h2><p v-if="!item.slots.length">Слотов пока нет.</p>
        <ul><li v-for="slot in item.slots" :key="slot.id">{{ slot.label }} — {{ slot.required_count }}<span v-if="slot.role"> · {{ slot.role.name }}</span></li></ul>
        <section v-if="manageable">
          <button type="button" data-test="edit-template" :disabled="busy" @click="editing = true">Редактировать шаблон</button>
          <button type="button" data-test="toggle-active" :disabled="busy" @click="act('active')">{{ item.active ? 'Выключить автоматическое создание' : 'Включить автоматическое создание' }}</button>
          <p>Правки шаблона не меняют уже созданные события.</p>
          <label>Дата события по календарю церкви <input v-model="date" data-test="event-date" type="date" :disabled="busy"></label>
          <button type="button" data-test="create-event" :disabled="busy" @click="act('create')">Создать событие на дату</button>
          <button type="button" data-test="archive-template" :disabled="busy" @click="confirmArchive = true">Архивировать шаблон</button>
          <section v-if="confirmArchive" role="dialog" aria-modal="true" aria-label="Архивация шаблона">
            <h2>Архивировать шаблон?</h2><p>Новые события автоматически создаваться не будут. Уже созданные события сохранятся.</p>
            <button type="button" data-test="confirm-archive" :disabled="busy" @click="act('archive')">Подтвердить архивацию</button>
            <button type="button" :disabled="busy" @click="confirmArchive = false">Назад</button>
          </section>
        </section>
        <p v-if="actionError" role="alert">{{ actionError }}</p>
      </template>
    </template>
  </main>
</template>
<style scoped>.template-page { max-width: 48rem; margin: auto; overflow-wrap: anywhere; } button, input { font: inherit; padding: .6rem; margin: .3rem; } label { display: block; margin-top: 1rem; } [role='dialog'] { background: #edf1f6; border: 1px solid #8b96a6; padding: 1rem; } [role='alert'] { color: #a32020; } .description { white-space: pre-wrap; }</style>
