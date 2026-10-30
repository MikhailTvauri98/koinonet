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
defineExpose({ clear })
</script>
<template>
  <form class="composer" @submit.prevent="submit">
    <div v-if="editing">Изменение сообщения <button type="button" :disabled="busy" @click="$emit('cancel')">Отменить</button></div>
    <ReplyPreview v-if="reply" :reply="{ id: reply.id, body_preview: reply.body, sender_name: reply.sender ? reply.sender.person?.full_name || 'Участник' : 'Удалённый человек', deleted: reply.deleted }" removable @cancel="$emit('cancel')" />
    <textarea ref="area" v-model="body" data-test="composer" aria-label="Сообщение" placeholder="Сообщение" maxlength="4000" rows="2" :disabled="busy" @input="resize" @keydown="keyboard" />
    <div class="composer-actions">
      <MediaUploader v-if="!editing" :key="uploaderKey" v-model:media-ids="mediaIds" purpose="message" label="Прикрепить файл" multiple :disabled="busy" @busy="uploading = $event" />
      <button data-test="send" type="submit" :disabled="busy || uploading || (!body.trim() && !mediaIds.length && !editing?.attachments.length)" @click.prevent="submit">{{ busy ? 'Сохранение…' : editing ? 'Сохранить' : 'Отправить' }}</button>
    </div>
  </form>
</template>
<style scoped>
.composer { border-top: 1px solid #d5dde4; padding-top: .6rem; }
textarea { display: block; box-sizing: border-box; width: 100%; padding: .6rem; font: inherit; resize: none; min-height: 3rem; }
.composer-actions { display: flex; align-items: center; justify-content: space-between; gap: .5rem; margin-top: .4rem; }
</style>
