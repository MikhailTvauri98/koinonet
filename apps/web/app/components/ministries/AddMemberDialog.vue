<script setup lang="ts">
import type { Person } from '~/utils/people'
import type { Member } from '~/utils/ministries'
import PeoplePicker from '~/components/people/PeoplePicker.vue'
import UiDialog from '~/components/ui/UiDialog.vue'
import { apiErrorMessage } from '~/utils/apiError'
const props = defineProps<{ ministryId: string }>()
const emit = defineEmits<{ added: [member: Member], close: [] }>()
const api = useApi(), auth = useAuthStore(), { can, canIn } = useCan()
const opened = ref(true), adding = ref(false), addError = ref('')
let active = true
const allowed = computed(() => can('people.view') && canIn(props.ministryId, 'members.manage'))
function close() {
  if (!opened.value) return
  opened.value = false; active = false; emit('close')
}
watch([() => props.ministryId, () => auth.sessionVersion], close, { flush: 'sync' })
watch(allowed, value => { if (!value) close() }, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => { active = false })
async function add(person: Person) {
  if (!active || !allowed.value || adding.value) return
  const ministryId = props.ministryId, session = auth.sessionVersion
  adding.value = true; addError.value = ''
  try {
    const response = await api.post<{ data: Member }>(`/ministries/${encodeURIComponent(ministryId)}/members`, { person_id: person.id })
    if (active && allowed.value && ministryId === props.ministryId && session === auth.sessionVersion) emit('added', response.data)
  } catch (error) {
    if (active && ministryId === props.ministryId && session === auth.sessionVersion) addError.value = apiErrorMessage(error, 'Не удалось добавить участника. Попробуйте ещё раз.')
  } finally { if (active) adding.value = false }
}
</script>
<template>
  <UiDialog :open="opened" label="Добавить участника" @close="close">
    <template v-if="opened">
      <h2>Добавить участника</h2>
      <PeoplePicker mode="people" :disabled="adding" @select="add" />
      <p v-if="addError" role="alert">{{ addError }}</p>
    </template>
    <template #actions><button type="button" data-test="cancel-add-member" class="ui-button ui-button--secondary" @click="close">Отмена</button></template>
  </UiDialog>
</template>
