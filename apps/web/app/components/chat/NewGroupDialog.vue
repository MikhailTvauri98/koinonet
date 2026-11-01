<script setup lang="ts">
import type { components } from '~~/types/api'
import UiDialog from '~/components/ui/UiDialog.vue'
import AccountPicker from './AccountPicker.vue'
import { apiErrorMessage } from '~/utils/apiError'
const opened = ref(true)
const emit = defineEmits<{ close: [] }>()
const api = useApi(), router = useRouter(), auth = useAuthStore(), { can } = useCan()
const title = ref(''), ids = ref<string[]>([]), busy = ref(false), error = ref('')
let active = true
function close() { opened.value = false; active = false; emit('close') }
watch(() => auth.sessionVersion, close)
watch(() => can('chats.create_groups'), allowed => { if (!allowed) close() })
async function create() {
  if (busy.value || !can('chats.create_groups') || !can('people.view') || !title.value.trim() || !ids.value.length) return
  busy.value = true; error.value = ''; const session = auth.sessionVersion
  try {
    const result = await api.post<{ data: components['schemas']['ChatResource'] }>('/chats', { type: 'group', title: title.value.trim(), member_ids: ids.value })
    if (active && session === auth.sessionVersion && can('chats.create_groups')) await router.push(`/chats/${result.data.id}`)
  } catch (failure) { if (active && session === auth.sessionVersion) error.value = apiErrorMessage(failure, 'Не удалось создать группу. Попробуйте ещё раз.') }
  finally { if (active) busy.value = false }
}
onBeforeUnmount(() => { active = false })
</script>
<template>
  <UiDialog :open="opened" label="Новая группа" @close="close">
    <h2>Новая группа</h2>
    <form @submit.prevent="create">
      <label>Название<input v-model="title" data-test="title" maxlength="100" required :disabled="busy"></label>
      <AccountPicker :disabled="busy" @selected="ids = $event" />
      <p v-if="error" role="alert">{{ error }}</p>
      <button data-test="create" type="submit" :disabled="busy || !title.trim() || !ids.length || !can('chats.create_groups')">Создать</button>
      <button type="button" :disabled="busy" @click="close">Отмена</button>
    </form>
  </UiDialog>
</template>
<style scoped>

label { display: block; margin: .5rem 0; }
</style>
