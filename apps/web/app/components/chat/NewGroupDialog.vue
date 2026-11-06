<script setup lang="ts">
import type { components } from '~~/types/api'
import UiDialog from '~/components/ui/UiDialog.vue'
import FormSection from '~/components/ui/FormSection.vue'
import AccountPicker from './AccountPicker.vue'
import { apiErrorMessage } from '~/utils/apiError'
const opened = ref(true)
const emit = defineEmits<{ close: [] }>()
const api = useApi(), router = useRouter(), auth = useAuthStore(), { can } = useCan()
const title = ref(''), ids = ref<string[]>([]), busy = ref(false), error = ref('')
const formId = useId()
const createdId = ref(''), navigating = ref(false)
const locked = computed(() => busy.value || navigating.value || !!createdId.value)
let active = true
function close() { if (!opened.value) return; opened.value = false; active = false; emit('close') }
watch(() => auth.sessionVersion, close, { flush: 'sync' })
watch(() => can('chats.create_groups') && can('people.view'), allowed => { if (!allowed) close() })
async function create() {
  if (busy.value || createdId.value || !active || !can('chats.create_groups') || !can('people.view') || !title.value.trim() || !ids.value.length) return
  busy.value = true; error.value = ''; const session = auth.sessionVersion
  try {
    const result = await api.post<{ data: components['schemas']['ChatResource'] }>('/chats', { type: 'group', title: title.value.trim(), member_ids: ids.value })
    if (active && session === auth.sessionVersion && can('chats.create_groups') && can('people.view')) createdId.value = result.data.id
  } catch (failure) { if (active && session === auth.sessionVersion) error.value = apiErrorMessage(failure, 'Не удалось создать группу. Попробуйте ещё раз.') }
  finally { if (active) busy.value = false }
  if (createdId.value && active) await openCreated()
}
async function openCreated() {
  if (!active || !createdId.value || navigating.value) return
  const session = auth.sessionVersion
  navigating.value = true; error.value = ''
  try { await router.push(`/chats/${createdId.value}`) }
  catch { if (active && session === auth.sessionVersion) error.value = 'Не удалось открыть чат. Попробуйте открыть его ещё раз.' }
  finally { if (active) navigating.value = false }
}
onBeforeUnmount(() => { active = false })
</script>
<template>
  <UiDialog :open="opened" label="Новая группа" @close="close">
    <h2>Новая группа</h2>
    <form v-if="opened" :id="formId" class="ui-form" @submit.prevent="create">
      <label class="ui-field">Название<input v-model="title" data-test="title" class="ui-input" maxlength="100" required :disabled="locked"></label>
      <FormSection title="Участники"><AccountPicker :disabled="locked" @selected="ids = $event" /></FormSection>
      <p v-if="createdId" role="status">Группа создана.</p>
      <p v-if="error" role="alert">{{ error }}</p>
    </form>
    <template #actions>
      <button v-if="createdId" type="button" class="ui-button ui-button--primary" :disabled="navigating" @click="openCreated">{{ navigating ? 'Открывается…' : 'Открыть чат' }}</button>
      <button v-else data-test="create" class="ui-button ui-button--primary" :form="formId" type="submit" :disabled="busy || !title.trim() || !ids.length || !can('chats.create_groups') || !can('people.view')">{{ busy ? 'Создаётся…' : 'Создать' }}</button>
      <button type="button" class="ui-button ui-button--secondary" @click="close">{{ createdId ? 'Закрыть' : 'Отмена' }}</button>
    </template>
  </UiDialog>
</template>
