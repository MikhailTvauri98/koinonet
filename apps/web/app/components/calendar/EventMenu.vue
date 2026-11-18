<script setup lang="ts">
import type { EventItem } from '~/composables/useEvents'
import UiDialog from '~/components/ui/UiDialog.vue'
const props = defineProps<{ event: EventItem, disabled?: boolean, busy?: boolean }>()
const emit = defineEmits<{ cancel: [], createChat: [] }>()
const opened = ref(false)
let revision = 0
const canCreateChat = computed(() => props.event.can_manage && !props.event.chat_id)
const canCancel = computed(() => props.event.can_manage && props.event.status !== 'cancelled')
const available = computed(() => canCreateChat.value || canCancel.value)
async function choose(action: 'cancel' | 'createChat') {
  if (props.disabled || (action === 'cancel' ? !canCancel.value : !canCreateChat.value)) return
  const token = revision
  opened.value = false
  // Фокус возвращается на «⋯» раньше, чем откроется подтверждение или начнётся запрос.
  await nextTick()
  if (token !== revision) return
  if (action === 'cancel') emit('cancel'); else emit('createChat')
}
watch([() => props.event.id, available], () => { revision++; opened.value = false })
onBeforeUnmount(() => { revision++ })
</script>

<template>
  <template v-if="available">
    <button type="button" class="ui-button ui-button--quiet event-menu-trigger" data-test="event-menu" aria-label="Действия с событием" aria-haspopup="dialog" :aria-expanded="opened" :disabled="disabled" @click="opened = true"><span aria-hidden="true">⋯</span></button>
    <UiDialog v-if="opened" :open="true" label="Действия с событием" @close="opened = false">
      <h2>Действия с событием</h2>
      <div class="event-menu">
        <button v-if="canCreateChat" type="button" class="ui-button" data-test="create-chat" :disabled="busy" @click="choose('createChat')">Создать чат события</button>
        <button v-if="canCancel" type="button" class="ui-button ui-button--danger" data-test="cancel-event" @click="choose('cancel')">Отменить событие</button>
      </div>
      <template #actions><button type="button" class="ui-button" @click="opened = false">Закрыть</button></template>
    </UiDialog>
  </template>
</template>

<style scoped>
.event-menu-trigger { min-width: 44px; min-height: 44px; font-size: 1.5rem; line-height: 1; }
.event-menu { display: flex; flex-direction: column; gap: var(--ui-space-2); }
.event-menu button { text-align: start; min-height: 44px; }
</style>
