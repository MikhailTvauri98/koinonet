<script setup lang="ts">
import type { components } from '~~/types/api'
import AccountPicker from './AccountPicker.vue'
import { apiErrorMessage } from '~/utils/apiError'
const props = defineProps<{ chat: components['schemas']['ChatResource'] }>()
const emit = defineEmits<{ changed: [], close: [] }>()
const api = useApi(), auth = useAuthStore()
const ids = ref<string[]>([]), busy = ref(false), error = ref(''), removing = ref<string | null>(null), pickerKey = ref(0)
const manageable = computed(() => props.chat.type === 'group' && props.chat.can_manage_members && !props.chat.archived)
const excluded = computed(() => props.chat.members.map(m => m.user_id))
let revision = 0
async function run(remove = false) {
  if (!manageable.value || busy.value || (remove ? !removing.value || props.chat.members.find(m => m.user_id === removing.value)?.is_owner : !ids.value.length)) return
  const token = revision, session = auth.sessionVersion, id = props.chat.id, user = removing.value
  busy.value = true; error.value = ''
  try {
    if (remove) await api.delete(`/chats/${id}/members/${user}`)
    else await api.post(`/chats/${id}/members`, { user_ids: ids.value })
    if (token !== revision || session !== auth.sessionVersion) return
    removing.value = null; ids.value = []; pickerKey.value++; emit('changed')
  } catch (failure) { if (token === revision) error.value = apiErrorMessage(failure, 'Не удалось изменить состав. Попробуйте ещё раз.') }
  finally { if (token === revision) busy.value = false }
}
watch(() => props.chat.id, () => { revision++; ids.value = []; removing.value = null; busy.value = false; error.value = ''; pickerKey.value++ })
onBeforeUnmount(() => { revision++ })
</script>
<template>
  <section role="dialog" aria-modal="true" aria-label="Участники группы" class="chat-dialog">
    <h2>Участники группы</h2>
    <ul><li v-for="person in chat.members" :key="person.user_id">
      {{ person.full_name || 'Участник' }} <span v-if="person.is_owner">(владелец)</span>
      <button v-if="manageable && !person.is_owner" type="button" :data-test="`remove-${person.user_id}`" :disabled="busy" @click="removing = person.user_id">Исключить</button>
    </li></ul>
    <div v-if="removing && manageable" role="alertdialog" aria-label="Исключить участника?">
      <p>Исключить участника из группы?</p><button data-test="confirm-remove" type="button" :disabled="busy" @click="run(true)">Исключить</button><button type="button" :disabled="busy" @click="removing = null">Отмена</button>
    </div>
    <template v-if="manageable">
      <AccountPicker :key="pickerKey" :excluded="excluded" :disabled="busy" @selected="ids = $event" />
      <button type="button" data-test="add-members" :disabled="busy || !ids.length" @click="run()">Добавить участников</button>
    </template>
    <p v-if="error" role="alert">{{ error }}</p>
    <button type="button" :disabled="busy" @click="emit('close')">Закрыть</button>
  </section>
</template>
<style scoped>
.chat-dialog { padding: 1rem; border: 1px solid #b6c1cb; background: #fff; }
</style>
