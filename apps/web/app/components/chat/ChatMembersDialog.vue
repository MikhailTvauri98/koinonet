<script setup lang="ts">
import type { components } from '~~/types/api'
import UiDialog from '~/components/ui/UiDialog.vue'
import AccountPicker from './AccountPicker.vue'
import { apiErrorMessage } from '~/utils/apiError'
const props = defineProps<{ chat: components['schemas']['ChatResource'] }>()
const opened = ref(true)
const emit = defineEmits<{ changed: [], close: [] }>()
const api = useApi(), auth = useAuthStore()
const ids = ref<string[]>([]), busy = ref(false), error = ref(''), removing = ref<string | null>(null), pickerKey = ref(0)
const manageable = computed(() => props.chat.type === 'group' && props.chat.can_manage_members && !props.chat.archived)
const label = computed(() => props.chat.type === 'ministry' ? 'Состав чата служения' : props.chat.type === 'event' ? 'Состав чата события' : 'Участники группы')
const confirmed = ref(false), removedIds = ref<string[]>([]), addedIds = ref<string[]>([])
const visibleMembers = computed(() => props.chat.members.filter(member => !removedIds.value.includes(member.user_id)))
const excluded = computed(() => [...props.chat.members.map(m => m.user_id), ...addedIds.value])
watch(() => props.chat.members, members => {
  const canonical = new Set(members.map(member => member.user_id))
  removedIds.value = removedIds.value.filter(id => canonical.has(id))
  addedIds.value = addedIds.value.filter(id => !canonical.has(id))
})
let revision = 0
function close(force = false) { if (busy.value && !force) return; revision++; opened.value = false; ids.value = []; removing.value = null; busy.value = false; error.value = ''; emit('close') }
watch(() => auth.sessionVersion, () => close(true), { flush: 'sync' })
watch(manageable, (allowed, previous) => { if (previous && !allowed) close(true) }, { flush: 'sync' })
async function run(remove = false) {
  if (!manageable.value || busy.value || (remove ? !removing.value || props.chat.members.find(m => m.user_id === removing.value)?.is_owner : !ids.value.length)) return
  const token = revision, session = auth.sessionVersion, id = props.chat.id, user = removing.value, selected = [...ids.value]
  busy.value = true; error.value = ''
  try {
    if (remove) await api.delete(`/chats/${id}/members/${user}`)
    else await api.post(`/chats/${id}/members`, { user_ids: selected })
    if (token !== revision || session !== auth.sessionVersion) return
    if (remove && user) removedIds.value.push(user)
    else addedIds.value.push(...selected)
    confirmed.value = true; removing.value = null; ids.value = []; pickerKey.value++; emit('changed')
  } catch (failure) { if (token === revision && session === auth.sessionVersion) error.value = apiErrorMessage(failure, 'Не удалось изменить состав. Попробуйте ещё раз.') }
  finally { if (token === revision && session === auth.sessionVersion) busy.value = false }
}
watch([() => props.chat.id, () => props.chat.type], () => { revision++; ids.value = []; removing.value = null; busy.value = false; error.value = ''; confirmed.value = false; removedIds.value = []; addedIds.value = []; pickerKey.value++ }, { flush: 'sync' })
onBeforeUnmount(() => { revision++ })
</script>
<template>
  <UiDialog :open="opened" :label="label" @close="close()">
    <h2>{{ label }}</h2>
    <p v-if="chat.type === 'ministry'" class="chat-members__note">Состав обновляется автоматически по участию в служении.</p>
    <p v-else-if="chat.type === 'event'" class="chat-members__note">Состав обновляется автоматически по назначениям на событие и включает создателя чата.</p>
    <ul class="chat-members__list"><li v-for="person in visibleMembers" :key="person.user_id">
      {{ person.full_name || 'Участник' }} <span v-if="person.is_owner">(владелец)</span>
      <button v-if="manageable && !person.is_owner" type="button" :data-test="`remove-${person.user_id}`" :disabled="busy" @click="removing = person.user_id">Исключить</button>
    </li></ul>
    <div v-if="removing && manageable" role="group" aria-label="Исключить участника?">
      <p>Исключить участника из группы?</p><button data-test="confirm-remove" type="button" :disabled="busy" @click="run(true)">Исключить</button><button type="button" :disabled="busy" @click="removing = null">Отмена</button>
    </div>
    <template v-if="manageable">
      <AccountPicker :key="pickerKey" :excluded="excluded" :disabled="busy" @selected="ids = $event" />
    </template>
    <p v-if="confirmed" role="status">Состав обновлён. <button type="button" data-test="refresh-members" :disabled="busy" @click="emit('changed')">Обновить состав</button></p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template #actions>
      <button v-if="manageable" type="button" data-test="add-members" :disabled="busy || !ids.length" @click="run()">Добавить участников</button>
      <button type="button" :disabled="busy" @click="close()">Закрыть</button>
    </template>
  </UiDialog>
</template>

<style scoped>
.chat-members__note { color: var(--ui-text-muted); font-size: .875rem; }
.chat-members__list { list-style: none; padding: 0; margin: min(1rem, 16px) 0; }
.chat-members__list li { display: flex; flex-wrap: wrap; align-items: center; gap: min(.5rem, 8px); padding-block: min(.75rem, 12px); border-bottom: 1px solid var(--ui-border); overflow-wrap: anywhere; }
.chat-members__list button { margin-left: auto; min-height: 44px; }
</style>
