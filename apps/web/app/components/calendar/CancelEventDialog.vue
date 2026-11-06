<script setup lang="ts">
import { apiErrorMessage } from '~/utils/apiError'
import UiDialog from '~/components/ui/UiDialog.vue'
const props = defineProps<{ eventId: string }>()
const emit = defineEmits<{ saved: [], cancel: [] }>()
const api = useApi(), auth = useAuthStore(), reason = ref(''), saving = ref(false), errorMessage = ref(''), saved = ref(false), invalid = ref(false)
let alive = true, generation = 0
watch(() => auth.sessionVersion, () => { invalid.value = true; generation++; reason.value = ''; errorMessage.value = ''; emit('cancel') }, { flush: 'sync' })
watch(() => props.eventId, () => { generation++; reason.value = ''; errorMessage.value = ''; saved.value = false; saving.value = false })
onBeforeUnmount(() => { alive = false; generation++ })
function close() { if (!saving.value) emit('cancel') }
async function confirm() {
  if (saving.value || saved.value || invalid.value) return
  const token = generation, session = auth.sessionVersion
  const current = () => alive && token === generation && session === auth.sessionVersion && !invalid.value
  saving.value = true; errorMessage.value = ''
  try { await api.post(`/events/${encodeURIComponent(props.eventId)}/cancel`, { reason: reason.value.trim() || null }); if (current()) { saved.value = true; emit('saved') } }
  catch (error) { if (current()) errorMessage.value = apiErrorMessage(error, 'Не удалось отменить событие. Попробуйте ещё раз.') }
  finally { if (current()) saving.value = false }
}
</script>
<template>
  <UiDialog v-if="!invalid" :open="true" label="Отменить событие?" @close="close">
    <h2>Отменить событие?</h2><p>Событие останется в календаре. Назначенные получат уведомление об отмене.</p>
    <label class="ui-field">Причина <textarea v-model="reason" data-test="reason" maxlength="500" rows="3" :disabled="saving || saved" /></label>
    <p v-if="errorMessage" role="alert">{{ errorMessage }}</p>
    <template #actions><button type="button" class="ui-button" :disabled="saving" @click="close">Назад</button><button type="button" class="ui-button ui-button--danger" data-test="confirm-cancel" :disabled="saving || saved" @click="confirm">{{ saving ? 'Отменяем…' : 'Подтвердить отмену' }}</button></template>
  </UiDialog>
</template>
