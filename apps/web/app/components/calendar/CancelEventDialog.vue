<script setup lang="ts">
import { apiErrorMessage } from '~/utils/apiError'
const props = defineProps<{ eventId: string }>()
const emit = defineEmits<{ saved: [], cancel: [] }>()
const api = useApi(), reason = ref(''), saving = ref(false), errorMessage = ref('')
async function confirm() {
  if (saving.value) return
  saving.value = true; errorMessage.value = ''
  try { await api.post(`/events/${encodeURIComponent(props.eventId)}/cancel`, { reason: reason.value.trim() || null }); emit('saved') }
  catch (error) { errorMessage.value = apiErrorMessage(error, 'Не удалось отменить событие. Попробуйте ещё раз.') }
  finally { saving.value = false }
}
</script>
<template>
  <section role="dialog" aria-modal="true" aria-label="Отмена события">
    <h2>Отменить событие?</h2><p>Назначенные получат уведомление об отмене.</p>
    <label>Причина <textarea v-model="reason" data-test="reason" maxlength="500" :disabled="saving" /></label>
    <p v-if="errorMessage" role="alert">{{ errorMessage }}</p>
    <button type="button" data-test="confirm-cancel" :disabled="saving" @click="confirm">Подтвердить отмену</button>
    <button type="button" :disabled="saving" @click="emit('cancel')">Назад</button>
  </section>
</template>
