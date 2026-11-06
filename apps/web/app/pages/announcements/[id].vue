<script setup lang="ts">
import type { Announcement } from '~/utils/announcements'
import { apiErrorMessage } from '~/utils/apiError'
import AnnouncementEditor from '~/components/announcements/AnnouncementEditor.vue'
import MarkdownBody from '~/components/announcements/MarkdownBody.vue'
import AttachmentList from '~/components/announcements/AttachmentList.vue'
const api = useApi(), route = useRoute(), auth = useAuthStore()
const { can, canIn } = useCan(), { formatDateTime } = useChurchDate()
const item = ref<Announcement | null>(null)
const errorMessage = ref(''), actionError = ref(''), feedback = ref('')
const editing = ref(false), confirming = ref(false), busy = ref(false), loading = ref(false)
const editorHeading = ref<HTMLElement | null>(null), detailHeading = ref<HTMLElement | null>(null)
let version = 0, actionVersion = 0
const manages = computed(() => !!item.value && ((auth.user?.id != null && item.value.author?.id === auth.user.id)
  || (item.value.scope === 'church' ? can('announcements.church.publish') : !!item.value.ministry && canIn(item.value.ministry.id, 'announcements.publish'))))
const editable = computed(() => manages.value && !item.value?.archived)
async function load() {
  const current = ++version, session = auth.sessionVersion
  const active = () => current === version && session === auth.sessionVersion
  actionVersion++; busy.value = false; loading.value = true
  item.value = null; editing.value = false; confirming.value = false; errorMessage.value = ''; actionError.value = ''; feedback.value = ''
  try {
    const result = await api.get<{ data: Announcement }>(`/announcements/${encodeURIComponent(String(route.params.id))}`)
    if (active()) item.value = result.data
  } catch (error) { if (active()) errorMessage.value = apiErrorMessage(error, 'Не удалось загрузить объявление. Попробуйте ещё раз.') }
  finally { if (active()) loading.value = false }
}
async function startEditing() {
  if (!editable.value || busy.value || editing.value) return
  confirming.value = false; feedback.value = ''; actionError.value = ''; editing.value = true
  await nextTick(); editorHeading.value?.focus()
}
async function closeEditor(result?: Announcement) {
  if (result) { item.value = result; feedback.value = 'Объявление сохранено.' }
  editing.value = false
  await nextTick(); detailHeading.value?.focus()
}
async function act(action: 'pin' | 'unpin' | 'archive') {
  if (!editable.value || !item.value || busy.value || editing.value) return
  const current = ++actionVersion, context = version, session = auth.sessionVersion
  const active = () => current === actionVersion && context === version && session === auth.sessionVersion
  busy.value = true; actionError.value = ''; feedback.value = ''
  try {
    const result = await api.post<{ data: Announcement }>(`/announcements/${encodeURIComponent(item.value.id)}/${action}`)
    if (!active()) return
    item.value = result.data; confirming.value = false
    feedback.value = action === 'archive' ? 'Объявление в архиве.' : action === 'pin' ? 'Объявление закреплено.' : 'Закрепление снято.'
  } catch (error) { if (active()) actionError.value = apiErrorMessage(error, 'Не удалось изменить объявление. Попробуйте ещё раз.') }
  finally { if (active()) busy.value = false }
}
watch([() => route.params.id, () => auth.sessionVersion], () => { void load() }, { flush: 'sync' })
watch(editable, allowed => { if (!allowed) { actionVersion++; busy.value = false; editing.value = false; confirming.value = false; actionError.value = '' } }, { flush: 'sync' })
onBeforeUnmount(() => { version++; actionVersion++ })
await load()
</script>

<template>
  <div class="announcement-page">
    <NuxtLink class="announcement-page__back" to="/announcements">← Объявления</NuxtLink>
    <p v-if="loading" role="status">Загружаем объявление…</p>
    <p v-if="errorMessage" role="alert">{{ errorMessage }} <button type="button" @click="load">Повторить</button></p>
    <template v-if="item">
      <h1 ref="detailHeading" tabindex="-1">{{ item.title }}</h1>
      <div class="announcement-page__meta">
        <span v-if="item.archived" class="announcement-page__badge">В архиве</span>
        <span v-if="item.pinned" class="announcement-page__badge">Закреплено</span>
        <p>{{ item.ministry?.name ?? 'Церковь' }} · <time :datetime="item.published_at">{{ formatDateTime(item.published_at) }}</time> · {{ item.author?.full_name ?? 'Удалённый человек' }}</p>
        <p v-if="item.hide_after">Скрыть после: {{ item.hide_after.split('-').reverse().join('.') }}</p>
        <p v-if="manages && item.views_count !== undefined" data-test="views">Просмотров: {{ item.views_count }}</p>
      </div>
      <template v-if="editable">
        <div class="announcement-page__actions">
          <button class="primary" data-test="edit" :disabled="busy || editing" @click="startEditing">Изменить</button>
          <button data-test="pin" :disabled="busy || editing" @click="act(item.pinned ? 'unpin' : 'pin')">{{ item.pinned ? 'Открепить' : 'Закрепить' }}</button>
          <button class="danger" data-test="archive" :disabled="busy || editing" @click="confirming = true">Архивировать</button>
        </div>
        <div v-if="confirming && !editing" class="announcement-page__confirmation" role="alertdialog" aria-label="Архивация объявления">
          <p>Архивировать объявление?</p>
          <button class="danger" data-test="confirm-archive" :disabled="busy" @click="act('archive')">Архивировать</button>
          <button :disabled="busy" @click="confirming = false">Отмена</button>
          <p v-if="actionError" role="alert">{{ actionError }}</p>
        </div>
        <div v-if="editing" class="announcement-page__editor">
          <h2 ref="editorHeading" data-test="editor-heading" tabindex="-1">Изменить объявление</h2>
          <AnnouncementEditor :key="item.id" :scope="item.scope" :ministry-id="item.ministry?.id" :announcement="item" @saved="closeEditor($event)" @cancel="closeEditor()" />
        </div>
      </template>
      <p v-if="actionError && !confirming" role="alert">{{ actionError }}</p>
      <p v-if="feedback" role="status">{{ feedback }}</p>
      <div v-if="!editing" class="announcement-page__content">
        <MarkdownBody :body="item.body" />
        <section v-if="item.attachments.length" aria-label="Вложения объявления"><h2>Вложения</h2><AttachmentList :attachments="item.attachments" /></section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.announcement-page { min-width: 0; width: 100%; margin-inline: auto; overflow-wrap: anywhere; }
h1 { margin-block: var(--ui-space-3); }
.announcement-page__back { display: inline-flex; align-items: center; min-height: var(--ui-control-height); }
.announcement-page__meta { color: var(--ui-text-muted); font-size: .875rem; }
.announcement-page__meta p { margin-block: var(--ui-space-2); }
.announcement-page__badge { display: inline-block; color: var(--ui-accent); background: var(--ui-accent-soft); padding: var(--ui-space-1) var(--ui-space-2); border-radius: var(--ui-radius-sm); margin-inline-end: var(--ui-space-2); }
.announcement-page__actions { display: flex; flex-wrap: wrap; gap: var(--ui-space-2); margin-block: var(--ui-space-4); }
.announcement-page__content { max-width: 48rem; border-top: 1px solid var(--ui-border); padding-top: var(--ui-space-3); }
.announcement-page__editor { margin-block: var(--ui-space-6); }
.announcement-page__confirmation { background: var(--ui-surface); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); padding: var(--ui-space-4); }
.announcement-page__confirmation button { margin-inline-end: var(--ui-space-2); margin-block: var(--ui-space-1); }
button { max-width: 100%; overflow-wrap: anywhere; }
.primary { background: var(--ui-accent); color: var(--ui-on-accent); border-color: var(--ui-accent); font-weight: 600; }
.danger, [role='alert'] { color: var(--ui-danger); }
</style>
