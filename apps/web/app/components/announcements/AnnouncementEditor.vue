<script setup lang="ts">
import type { Announcement } from '~/utils/announcements'
import { apiErrorMessage, apiFieldErrors } from '~/utils/apiError'
import MediaUploader from '~/components/MediaUploader.vue'
import AttachmentList from './AttachmentList.vue'

const props = defineProps<{ scope: 'church' | 'ministry', ministryId?: string, announcement?: Announcement }>()
const emit = defineEmits<{ saved: [announcement: Announcement], cancel: [] }>()
const api = useApi()
const title = ref(props.announcement?.title ?? '')
const body = ref(props.announcement?.body ?? '')
const pinned = ref(props.announcement?.pinned ?? false)
const hideAfter = ref(props.announcement?.hide_after ?? '')
const notify = ref(true)
const mediaIds = ref(props.announcement?.attachments.map(media => media.id) ?? [])
const retained = computed(() => props.announcement?.attachments.filter(media => mediaIds.value.includes(media.id)) ?? [])
const saving = ref(false)
const uploading = ref(false)
const uploadError = ref('')
const errorMessage = ref('')
const fieldErrors = ref<Record<string, string[]>>({})

async function save() {
  if (saving.value || uploading.value || uploadError.value || props.announcement?.archived) return
  errorMessage.value = ''
  fieldErrors.value = {}
  if (!title.value.trim() || !body.value.trim() || title.value.trim().length > 200 || body.value.length > 20000) {
    errorMessage.value = 'Заполните заголовок (до 200 символов) и текст (до 20000 символов).'
    return
  }
  if (props.scope === 'ministry' && !props.ministryId) {
    errorMessage.value = 'Выберите служение.'
    return
  }
  saving.value = true
  const payload = { title: title.value.trim(), body: body.value, pinned: pinned.value, hide_after: hideAfter.value || null, media_ids: [...mediaIds.value] }
  try {
    const response = props.announcement
      ? await api.patch<{ data: Announcement }>(`/announcements/${encodeURIComponent(props.announcement.id)}`, payload)
      : await api.post<{ data: Announcement }>('/announcements', { ...payload, scope: props.scope, ...(props.scope === 'ministry' ? { ministry_id: props.ministryId } : {}), notify_on_publish: notify.value })
    emit('saved', response.data)
  } catch (error) {
    errorMessage.value = apiErrorMessage(error, 'Не удалось сохранить объявление. Попробуйте ещё раз.')
    fieldErrors.value = apiFieldErrors(error)
  } finally { saving.value = false }
}
</script>

<template>
  <form class="announcement-editor" @submit.prevent="save">
    <fieldset :disabled="saving || announcement?.archived">
      <label>Заголовок <input v-model="title" data-test="title" maxlength="200" required></label>
      <label>Текст <textarea v-model="body" data-test="body" rows="10" maxlength="20000" required /></label>
      <p>Markdown: **жирный**, *курсив*, [ссылка](https://…), списки и заголовки.</p>
      <AttachmentList :attachments="retained" />
      <ul v-if="mediaIds.length" aria-label="Выбранные вложения">
        <li v-for="(id, index) in mediaIds" :key="id">Вложение {{ index + 1 }} <button type="button" :disabled="uploading" @click="mediaIds = mediaIds.filter(item => item !== id)">Убрать</button></li>
      </ul>
      <MediaUploader v-model:media-ids="mediaIds" purpose="announcement" multiple label="Добавить вложения" @busy="uploading = $event" @error="uploadError = $event" />
      <p v-if="uploadError">Повторите загрузку или <button type="button" @click="uploadError = ''">продолжите без неудавшихся вложений</button>.</p>
      <label><input v-model="pinned" type="checkbox"> Закрепить</label>
      <label>Скрыть после <input v-model="hideAfter" data-test="hide-after" type="date"></label>
      <label v-if="!announcement"><input v-model="notify" type="checkbox"> Уведомить</label>
      <p v-if="errorMessage" role="alert">{{ errorMessage }}</p>
      <p v-for="(messages, field) in fieldErrors" :key="field" role="alert">{{ messages.join(' ') }}</p>
      <button type="submit" :disabled="uploading || !!uploadError">{{ saving ? 'Сохраняется…' : announcement ? 'Сохранить' : 'Опубликовать' }}</button>
      <button type="button" @click="emit('cancel')">Отмена</button>
    </fieldset>
  </form>
</template>

<style scoped>
.announcement-editor { min-width: 0; max-width: 40rem; overflow-wrap: anywhere; }
fieldset { min-inline-size: 0; max-width: 100%; margin: 0; border: 0; padding: 0; }
label { display: block; margin: var(--ui-space-4) 0; }
input:not([type='checkbox']), textarea { display: block; min-width: 0; max-width: 100%; width: 100%; }
button { max-width: calc(100% - var(--ui-space-1)); margin: var(--ui-space-1) var(--ui-space-1) var(--ui-space-1) 0; overflow-wrap: anywhere; }
[role='alert'] { color: var(--ui-danger); }
</style>
