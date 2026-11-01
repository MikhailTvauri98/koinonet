<script setup lang="ts">
import type { ChatMessage } from '~/composables/useChatMessages'
import UiDialog from '~/components/ui/UiDialog.vue'
const props = defineProps<{ message: ChatMessage, own: boolean, writable: boolean, moderate: boolean, pinned: boolean }>()
const emit = defineEmits<{ reply: [message: ChatMessage], edit: [message: ChatMessage], delete: [message: ChatMessage], pin: [message: ChatMessage] }>()
const opened = ref(false)
let revision = 0
const available = computed(() => !props.message.deleted && (props.writable || props.moderate))
async function choose(action: 'reply' | 'edit' | 'delete' | 'pin') {
  const allowed = action === 'reply' ? props.writable : action === 'edit' ? props.own && props.writable : action === 'delete' ? (props.own && props.writable) || props.moderate : props.moderate
  if (!available.value || !allowed) return
  const token = revision
  opened.value = false
  // Close/restore the trigger before a confirmation dialog or composer opens.
  await nextTick()
  if (token !== revision) return
  switch (action) {
    case 'reply': emit('reply', props.message); break
    case 'edit': emit('edit', props.message); break
    case 'delete': emit('delete', props.message); break
    case 'pin': emit('pin', props.message); break
  }
}
watch([() => props.message.id, () => props.message.deleted, () => props.own, () => props.writable, () => props.moderate], () => { revision++; opened.value = false })
onBeforeUnmount(() => { revision++ })
</script>
<template>
  <template v-if="available">
    <button type="button" class="message-actions-trigger" :data-test="`actions-${message.id}`" aria-label="Действия сообщения" aria-haspopup="dialog" :aria-expanded="opened" @click="opened = true"><span aria-hidden="true">⋯</span></button>
    <UiDialog v-if="opened" :open="true" label="Действия сообщения" @close="opened = false">
      <h2>Действия сообщения</h2>
      <div class="message-actions">
        <button v-if="writable" type="button" :data-test="`reply-${message.id}`" @click="choose('reply')">Ответить</button>
        <button v-if="own && writable" type="button" :data-test="`edit-${message.id}`" @click="choose('edit')">Изменить</button>
        <button v-if="(own && writable) || moderate" type="button" :data-test="`delete-${message.id}`" @click="choose('delete')">Удалить</button>
        <button v-if="moderate" type="button" :data-test="`pin-${message.id}`" @click="choose('pin')">{{ pinned ? 'Открепить' : 'Закрепить' }}</button>
        <button type="button" @click="opened = false">Закрыть</button>
      </div>
    </UiDialog>
  </template>
</template>
<style scoped>
.message-actions-trigger { flex: 0 0 auto; padding: .25rem; min-width: 44px; min-height: 44px; font-size: 1.25rem; background: transparent; border-color: transparent; }
.message-actions { display: flex; flex-direction: column; gap: .4rem; }
</style>
