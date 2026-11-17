<script setup lang="ts">
import UiDialog from '~/components/ui/UiDialog.vue'
const emit = defineEmits<{ direct: [], group: [] }>()
const { can } = useCan()
const opened = ref(false)
let revision = 0
const canDirect = computed(() => can('people.view') && can('chats.dm'))
const canGroup = computed(() => can('chats.create_groups'))
const available = computed(() => canDirect.value || canGroup.value)
const hasChoice = computed(() => canDirect.value && canGroup.value)
function start() {
  if (hasChoice.value) opened.value = true
  else if (canDirect.value) emit('direct')
  else if (canGroup.value) emit('group')
}
async function choose(action: 'direct' | 'group') {
  if (action === 'direct' ? !canDirect.value : !canGroup.value) return
  const token = revision
  opened.value = false
  // Фокус возвращается на «Написать» раньше, чем откроется выбранное окно.
  await nextTick()
  if (token !== revision) return
  if (action === 'direct') emit('direct'); else emit('group')
}
watch([canDirect, canGroup], () => { revision++; opened.value = false })
onBeforeUnmount(() => { revision++ })
</script>

<template>
  <template v-if="available">
    <button type="button" class="ui-button ui-button--primary chat-write" data-test="write" :aria-haspopup="hasChoice ? 'dialog' : undefined" :aria-expanded="hasChoice ? opened : undefined" @click="start">Написать</button>
    <UiDialog v-if="opened && hasChoice" :open="true" label="Написать" @close="opened = false">
      <h2>Написать</h2>
      <div class="chat-write-menu">
        <button type="button" class="ui-button" data-test="write-direct" @click="choose('direct')">Личное сообщение</button>
        <button type="button" class="ui-button" data-test="write-group" @click="choose('group')">Новая группа</button>
      </div>
      <template #actions><button type="button" class="ui-button" @click="opened = false">Закрыть</button></template>
    </UiDialog>
  </template>
</template>

<style scoped>
.chat-write { flex: none; }
.chat-write-menu { display: flex; flex-direction: column; gap: var(--ui-space-2); }
.chat-write-menu button { text-align: start; min-height: 44px; }
</style>
