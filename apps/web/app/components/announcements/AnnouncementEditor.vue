<script setup lang="ts">
import type { Announcement } from '~/utils/announcements'
import { apiErrorMessage, apiFieldErrors } from '~/utils/apiError'
import FormSection from '~/components/ui/FormSection.vue'
import MediaUploader from '~/components/MediaUploader.vue'
import AttachmentList from './AttachmentList.vue'

const props = defineProps<{ scope: 'church' | 'ministry', ministryId?: string, announcement?: Announcement }>()
const emit = defineEmits<{ saved: [announcement: Announcement], cancel: [], busy: [value: boolean] }>()
const api = useApi(), auth = useAuthStore(), prefix = useId()
const form = ref<HTMLFormElement | null>(null)
const title = ref(props.announcement?.title ?? ''), body = ref(props.announcement?.body ?? '')
const pinned = ref(props.announcement?.pinned ?? false), hideAfter = ref(props.announcement?.hide_after ?? ''), notify = ref(true)
const mediaIds = ref(props.announcement?.attachments.map(media => media.id) ?? [])
const retained = computed(() => props.announcement?.attachments.filter(media => mediaIds.value.includes(media.id)) ?? [])
const saving = ref(false), confirmed = ref(false), uploading = ref(false), uploadError = ref(''), errorMessage = ref('')
const fieldErrors = ref<Record<string, string[]>>({})
const generation = ref(0)
watch(saving, value => emit('busy', value), { flush: 'sync' })
const id = (field: string) => `${prefix}-${field}`
const errors = (field: string) => fieldErrors.value[field]?.join(' ')
async function focusError() {
  await nextTick()
  form.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
}
watch([() => props.announcement?.id, () => props.scope, () => props.ministryId, () => auth.sessionVersion], () => {
  generation.value++
  title.value = props.announcement?.title ?? ''; body.value = props.announcement?.body ?? ''
  pinned.value = props.announcement?.pinned ?? false; hideAfter.value = props.announcement?.hide_after ?? ''
  mediaIds.value = props.announcement?.attachments.map(media => media.id) ?? []
  notify.value = true; saving.value = false; confirmed.value = false; uploading.value = false
  uploadError.value = ''; errorMessage.value = ''; fieldErrors.value = {}
}, { flush: 'sync' })
onBeforeUnmount(() => { generation.value++; emit('busy', false) })
async function save() {
  if (saving.value || confirmed.value || uploading.value || uploadError.value || props.announcement?.archived) return
  errorMessage.value = ''; fieldErrors.value = {}
  if (!title.value.trim() || title.value.trim().length > 200) fieldErrors.value.title = ['Введите заголовок до 200 символов.']
  if (!body.value.trim() || body.value.length > 20000) fieldErrors.value.body = ['Введите текст до 20000 символов.']
  if (Object.keys(fieldErrors.value).length) { await focusError(); return }
  if (props.scope === 'ministry' && !props.ministryId) { errorMessage.value = 'Выберите служение.'; return }
  const current = generation.value, session = auth.sessionVersion
  const active = () => current === generation.value && session === auth.sessionVersion
  saving.value = true
  const payload = { title: title.value.trim(), body: body.value, pinned: pinned.value, hide_after: hideAfter.value || null, media_ids: [...mediaIds.value] }
  try {
    const response = props.announcement
      ? await api.patch<{ data: Announcement }>(`/announcements/${encodeURIComponent(props.announcement.id)}`, payload)
      : await api.post<{ data: Announcement }>('/announcements', { ...payload, scope: props.scope, ...(props.scope === 'ministry' ? { ministry_id: props.ministryId } : {}), notify_on_publish: notify.value })
    if (!active()) return
    confirmed.value = true
    emit('saved', response.data)
  } catch (error) {
    if (!active()) return
    errorMessage.value = apiErrorMessage(error, 'Не удалось сохранить объявление. Попробуйте ещё раз.')
    fieldErrors.value = apiFieldErrors(error)
  } finally { if (active()) saving.value = false }
  if (active() && Object.keys(fieldErrors.value).length) await focusError()
}
</script>

<template>
  <div class="announcement-editor-container"><form ref="form" class="announcement-editor" novalidate @submit.prevent="save">
    <fieldset class="ui-fieldset" :disabled="saving || confirmed || announcement?.archived">
      <legend class="visually-hidden">Данные объявления</legend>
      <div class="announcement-editor__grid">
      <FormSection class="announcement-editor__publication" title="Публикация">
      <div class="announcement-editor__field">
        <label :for="id('title')">Заголовок</label>
        <input :id="id('title')" v-model="title" data-test="title" maxlength="200" required :aria-invalid="!!errors('title') || undefined" :aria-describedby="errors('title') ? id('title-error') : undefined">
        <p v-if="errors('title')" :id="id('title-error')" class="field-error">{{ errors('title') }}</p>
      </div>
      <div class="announcement-editor__field">
        <label :for="id('hide-after')">Скрыть после</label>
        <input :id="id('hide-after')" v-model="hideAfter" data-test="hide-after" type="date" :aria-invalid="!!errors('hide_after') || undefined" :aria-describedby="errors('hide_after') ? id('hide-after-error') : id('hide-help')">
        <p v-if="errors('hide_after')" :id="id('hide-after-error')" class="field-error">{{ errors('hide_after') }}</p>
        <p :id="id('hide-help')" class="hint">В эту дату объявление ещё видно в списке. Прямая ссылка останется доступной.</p>
      </div>
      <label class="check"><input v-model="pinned" type="checkbox"> Закрепить</label>
      <label v-if="!announcement" class="check"><input v-model="notify" type="checkbox"> Уведомить о публикации</label>
      </FormSection>
      <FormSection class="announcement-editor__text" title="Текст">
      <label :for="id('body')">Текст объявления</label>
      <textarea :id="id('body')" v-model="body" data-test="body" rows="7" maxlength="20000" required :aria-invalid="!!errors('body') || undefined" :aria-describedby="errors('body') ? id('body-error') : id('markdown-help')" />
      <p v-if="errors('body')" :id="id('body-error')" class="field-error">{{ errors('body') }}</p>
      <p :id="id('markdown-help')" class="hint">Markdown: **жирный**, *курсив*, [ссылка](https://…), списки и заголовки.</p>
      </FormSection>
      <FormSection class="announcement-editor__attachments" title="Вложения">
      <AttachmentList :attachments="retained" />
      <ul v-if="mediaIds.length" class="selected-attachments" aria-label="Выбранные вложения">
        <li v-for="(mediaId, index) in mediaIds" :key="mediaId">Вложение {{ index + 1 }} <button type="button" :disabled="uploading" @click="mediaIds = mediaIds.filter(item => item !== mediaId)">Убрать</button></li>
      </ul>
      <MediaUploader :key="generation" v-model:media-ids="mediaIds" purpose="announcement" multiple label="Добавить вложения" @busy="uploading = $event" @error="uploadError = $event" />
      <p v-if="uploading" role="status">Подготавливаем вложения. Публикация станет доступна после обработки.</p>
      <p v-if="uploadError">Повторите загрузку или <button type="button" @click="uploadError = ''">продолжите без неудавшихся вложений</button>.</p>
      <p v-if="errors('media_ids')" class="field-error">{{ errors('media_ids') }}</p>
      </FormSection>
      </div>
    </fieldset>
    <div class="announcement-editor__actions">
      <p v-if="errorMessage" role="alert">{{ errorMessage }}</p>
      <p v-for="(messages, field) in Object.fromEntries(Object.entries(fieldErrors).filter(([key]) => !['title', 'body', 'hide_after', 'media_ids'].includes(key)))" :key="field" role="alert">{{ messages.join(' ') }}</p>
      <div class="action-buttons">
        <button class="primary" type="submit" :disabled="saving || confirmed || uploading || !!uploadError || announcement?.archived">{{ saving ? 'Сохраняется…' : announcement ? 'Сохранить' : 'Опубликовать' }}</button>
        <button type="button" :disabled="saving" @click="emit('cancel')">Отмена</button>
      </div>
    </div>
  </form></div>
</template>

<style scoped>
.announcement-editor-container { container-type: inline-size; min-width: 0; }
.announcement-editor { min-width: 0; width: 100%; overflow-wrap: anywhere; }
.announcement-editor__grid { min-width: 0; display: grid; gap: var(--ui-space-4); align-items: start; }
fieldset { min-inline-size: 0; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
.announcement-editor__actions { margin-top: var(--ui-space-4); }
.announcement-editor__field { min-width: 0; }
.announcement-editor__field + .announcement-editor__field { margin-top: var(--ui-space-4); }
label:not(.check) { display: block; margin-bottom: var(--ui-space-2); font-weight: 600; }
input:not([type='checkbox']), textarea { display: block; min-width: 0; max-width: 100%; width: 100%; scroll-margin-block: 5rem; }
input[type='date'] { max-width: 18rem; }
textarea { resize: vertical; }
.check { min-height: var(--ui-control-height); display: flex; align-items: center; gap: var(--ui-space-2); }
.hint { color: var(--ui-text-muted); font-size: .875rem; margin-block: var(--ui-space-2) 0; }
.field-error, [role='alert'] { color: var(--ui-danger); }
.field-error { margin-block: var(--ui-space-2) 0; }
.selected-attachments { display: grid; gap: var(--ui-space-2); list-style: none; padding: 0; }
.selected-attachments li, .action-buttons { display: flex; align-items: center; flex-wrap: wrap; gap: var(--ui-space-2); }
button { max-width: 100%; overflow-wrap: anywhere; }
.primary { background: var(--ui-accent); color: var(--ui-on-accent); border-color: var(--ui-accent); font-weight: 600; }
.announcement-editor__actions { grid-column: 1 / -1; }
@container (min-width: 680px) {
  .announcement-editor__publication { grid-column: 1; }
  .announcement-editor__text { grid-column: 2; grid-row: 1; }
  .announcement-editor__attachments { grid-column: 1 / -1; }
}
@container (min-width: 680px) { .announcement-editor__grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); } }
</style>
