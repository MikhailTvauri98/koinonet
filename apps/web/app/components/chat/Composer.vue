<script setup lang="ts">
import type { ChatMessage } from '~/composables/useChatMessages'
import MediaUploader from '~/components/MediaUploader.vue'
import ReplyPreview from './ReplyPreview.vue'
const props = defineProps<{ busy: boolean, reply: ChatMessage | null, editing: ChatMessage | null }>()
const emit = defineEmits<{ send: [payload: { body: string, media_ids: string[], reply_to_id: string | null }], cancel: [] }>()
const body = ref('')
const mediaIds = ref<string[]>([])
const uploading = ref(false)
const uploaderKey = ref(0)
const area = ref<HTMLTextAreaElement>()
watch(() => props.editing, message => { body.value = message?.body ?? ''; void nextTick(resize) })
function resize() { if (area.value) { area.value.style.height = 'auto'; area.value.style.height = `${Math.min(area.value.scrollHeight, 180)}px` } }
function submit() {
  if (props.busy || uploading.value || (!body.value.trim() && !mediaIds.value.length && !props.editing?.attachments.length)) return
  emit('send', { body: body.value, media_ids: [...mediaIds.value], reply_to_id: props.reply?.id ?? null })
}
function keyboard(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && window.matchMedia('(pointer: fine)').matches) { event.preventDefault(); submit() }
}
function clear() { body.value = ''; mediaIds.value = []; uploaderKey.value++; void nextTick(resize) }
function focus() { area.value?.focus() }
defineExpose({ clear, focus })
</script>
<template>
  <form class="composer" @submit.prevent="submit">
    <div v-if="editing" class="composer-editing"><strong>Изменение сообщения</strong> <button type="button" :disabled="busy" @click="$emit('cancel')">Отменить</button></div>
    <ReplyPreview v-if="reply" :reply="{ id: reply.id, body_preview: reply.body, sender_name: reply.sender ? reply.sender.person?.full_name || 'Участник' : 'Удалённый человек', deleted: reply.deleted }" removable @cancel="$emit('cancel')" />
    <textarea ref="area" v-model="body" data-test="composer" aria-label="Сообщение" placeholder="Сообщение" maxlength="4000" rows="1" :disabled="busy" @input="resize" @keydown="keyboard" />
    <div class="composer-actions">
      <MediaUploader v-if="!editing" :key="uploaderKey" v-model:media-ids="mediaIds" purpose="message" label="Прикрепить файл" multiple :disabled="busy" @busy="uploading = $event" />
      <button class="ui-button ui-button--primary" data-test="send" type="submit" :disabled="busy || uploading || (!body.trim() && !mediaIds.length && !editing?.attachments.length)" @click.prevent="submit">{{ busy ? 'Сохранение…' : editing ? 'Сохранить' : 'Отправить' }}</button>
    </div>
  </form>
</template>
<style scoped>
.composer { border-top: 1px solid var(--ui-border); padding-block: .5rem .25rem; min-width: 0; }
textarea { display: block; box-sizing: border-box; width: 100%; padding: .625rem .75rem; font: inherit; line-height: 1.5; resize: none; min-height: 44px; max-height: 180px; border-radius: .625rem; background: var(--ui-canvas); }
.composer-actions { display: flex; flex-wrap: wrap; align-items: start; justify-content: space-between; gap: .5rem; margin-top: .5rem; }
.composer-actions > * { min-width: 0; max-width: 100%; }
.composer-actions > .ui-button { margin-inline-start: auto; }
.composer-editing { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .5rem; padding-bottom: .5rem; font-size: .875rem; }
.composer-editing strong { color: var(--ui-accent); }
.composer-editing button { font-size: inherit; min-width: 44px; }
.composer :deep(.previews:empty) { display: none; }
.composer :deep(.previews) { margin-block: .5rem 0; }
.composer :deep(.previews li) { padding: .5rem; gap: .25rem; border: 1px solid var(--ui-border); border-radius: .625rem; background: var(--ui-surface-muted); font-size: .875rem; }
.composer :deep(.previews button) { min-width: 44px; min-height: 44px; }
</style>
