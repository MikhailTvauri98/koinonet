<script setup lang="ts">
import type { Person } from '~/utils/people'
import PeoplePicker from '~/components/people/PeoplePicker.vue'
import UiDialog from '~/components/ui/UiDialog.vue'
import { isDirectChatTarget, useDirectChatNavigation } from '~/composables/useStartDirectChat'
const emit = defineEmits<{ close: [] }>()
const auth = useAuthStore(), { can } = useCan()
const opened = ref(true), target = ref<Person | null>(null)
const { pending, error, confirmedId, open } = useDirectChatNavigation(() => String(opened.value))
function close() { if (!opened.value) return; opened.value = false; emit('close') }
function requestClose() { if (!pending.value) close() }
watch([() => auth.sessionVersion, () => auth.user?.id], close, { flush: 'sync' })
watch(() => can('people.view') && can('chats.dm'), allowed => { if (!allowed) close() }, { flush: 'sync' })
async function select(person: Person) {
  if (!opened.value || !can('people.view') || !can('chats.dm') || pending.value || confirmedId.value || !isDirectChatTarget(person, auth.user?.id)) return
  target.value = person
  await open(person.user_id!)
}
</script>

<template>
  <UiDialog :open="opened" label="Новое сообщение" @close="requestClose">
    <template v-if="opened">
      <h2>Новое сообщение</h2>
      <p>Выберите человека, чтобы открыть личный чат.</p>
      <PeoplePicker v-if="!confirmedId" mode="accounts" :disabled="pending" @select="select" />
      <p v-if="pending" role="status">{{ confirmedId ? 'Переход в чат…' : 'Открываем личный чат…' }}</p>
      <p v-else-if="confirmedId" role="status">Личный чат открыт. Можно перейти к сообщениям.</p>
      <p v-if="error" role="alert">{{ error }}</p>
    </template>
    <template #actions>
      <button v-if="confirmedId && target?.user_id" type="button" class="ui-button ui-button--primary" data-test="open-direct-chat" :disabled="pending" @click="open(target.user_id)">Открыть чат</button>
      <button type="button" class="ui-button ui-button--secondary" :disabled="pending" @click="requestClose">{{ confirmedId ? 'Закрыть' : 'Отмена' }}</button>
    </template>
  </UiDialog>
</template>
